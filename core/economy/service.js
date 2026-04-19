const Wallet = require('../../models/Wallet');
const Transaction = require('../../models/Transaction');

const SHOP_CATALOG = [
    { id: 'nitro-boost', name: 'Nitro XP Boost', price: 150, type: 'boost', description: '+25% XP for next event window.' },
    { id: 'gold-wheel', name: 'Gold Wheel Cosmetic', price: 300, type: 'cosmetic', description: 'Exclusive profile cosmetic unlock.' },
    { id: 'vip-pass', name: 'VIP Event Pass', price: 500, type: 'exclusive', description: 'Priority queue for one drift event.' },
];

async function ensureWallet(discordId) {
    let wallet = await Wallet.findOne({ discordId });
    if (!wallet) wallet = await Wallet.create({ discordId });
    return wallet;
}

async function getWalletSummary(discordId) {
    const wallet = await ensureWallet(discordId);
    return {
        balance: Number(wallet.balance || 0),
        totalEarned: Number(wallet.totalEarned || 0),
        totalSpent: Number(wallet.totalSpent || 0),
        dailyStreak: Number(wallet.dailyStreak || 0),
    };
}

async function applyTransaction({ discordId, amount, type, source, reason = '', metadata = {}, idempotencyKey = null }) {
    const rawAmount = Math.max(0, Math.floor(Number(amount || 0)));
    if (!rawAmount) throw new Error('Transaction amount must be greater than 0.');
    if (!['credit', 'debit'].includes(type)) throw new Error('Invalid transaction type.');

    if (idempotencyKey) {
        const existing = await Transaction.findOne({ idempotencyKey });
        if (existing) {
            return { reused: true, transaction: existing, balanceAfter: existing.balanceAfter };
        }
    }

    await ensureWallet(discordId);

    const update = type === 'credit'
        ? { $inc: { balance: rawAmount, totalEarned: rawAmount } }
        : { $inc: { balance: -rawAmount, totalSpent: rawAmount } };

    const query = type === 'debit'
        ? { discordId, balance: { $gte: rawAmount } }
        : { discordId };

    const wallet = await Wallet.findOneAndUpdate(query, update, { new: true });
    if (!wallet) throw new Error('Insufficient balance.');

    try {
        const transaction = await Transaction.create({
            discordId,
            type,
            amount: rawAmount,
            source,
            reason,
            metadata,
            idempotencyKey,
            balanceAfter: Number(wallet.balance || 0),
        });
        return { reused: false, transaction, balanceAfter: Number(wallet.balance || 0) };
    } catch (err) {
        // Compensate wallet if ledger write fails so balance and ledger never drift silently.
        const compensation = type === 'credit'
            ? { $inc: { balance: -rawAmount, totalEarned: -rawAmount } }
            : { $inc: { balance: rawAmount, totalSpent: -rawAmount } };
        await Wallet.findOneAndUpdate({ discordId }, compensation).catch(() => null);
        throw err;
    }
}

function getShopCatalog() {
    return SHOP_CATALOG;
}

async function buyShopItem({ discordId, itemId }) {
    const item = SHOP_CATALOG.find((x) => x.id === itemId);
    if (!item) throw new Error('Shop item not found.');

    const wallet = await ensureWallet(discordId);
    const now = Date.now();
    const lastPurchase = wallet.lastPurchaseAt ? wallet.lastPurchaseAt.getTime() : 0;
    if (now - lastPurchase < 2000) {
        throw new Error('Purchase cooldown active. Please wait a moment before buying again.');
    }

    const result = await applyTransaction({
        discordId,
        amount: item.price,
        type: 'debit',
        source: `shop:${item.id}`,
        reason: `Purchased ${item.name}`,
        metadata: { itemId: item.id, itemType: item.type },
        idempotencyKey: `shop-${discordId}-${item.id}-${Math.floor(now / 1000)}`,
    });

    wallet.lastPurchaseAt = new Date();
    await wallet.save();

    return { item, balanceAfter: result.balanceAfter };
}

module.exports = {
    ensureWallet,
    getWalletSummary,
    applyTransaction,
    getShopCatalog,
    buyShopItem,
};
