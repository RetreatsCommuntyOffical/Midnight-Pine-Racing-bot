const Wallet = require('../../models/Wallet');
const Transaction = require('../../models/Transaction');
const AdminAuditLog = require('../../models/AdminAuditLog');

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
            // Log idempotency reuse for audit trail
            await AdminAuditLog.create({
                action: 'transaction_idempotency_reuse',
                targetId: discordId,
                actorId: 'economy-system',
                reason: `Reused transaction for source=${source}`,
                metadata: { idempotencyKey, transactionId: String(existing._id), amount: existing.amount, type: existing.type },
            }).catch(() => null);
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
    if (!wallet) {
        // Log failed debit due to insufficient balance
        await AdminAuditLog.create({
            action: 'transaction_failed_insufficient_balance',
            targetId: discordId,
            actorId: 'economy-system',
            reason: `Insufficient balance for debit of ${rawAmount} from source=${source}`,
            metadata: { source, reason, amount: rawAmount, type },
        }).catch(() => null);
        throw new Error('Insufficient balance.');
    }

    // Validate balanceAfter is non-negative (should never fail due to schema constraint, but belt-and-suspenders)
    const balanceAfter = Number(wallet.balance || 0);
    if (balanceAfter < 0) {
        console.error(`[CRITICAL] Negative balance detected after transaction update: ${discordId} balance=${balanceAfter}`);
        await AdminAuditLog.create({
            action: 'critical_negative_balance',
            targetId: discordId,
            actorId: 'economy-system',
            reason: `Wallet balance went negative: ${balanceAfter}`,
            metadata: { source, reason, amount: rawAmount, type, balanceAfter },
        }).catch(() => null);
        throw new Error('Critical: negative balance detected');
    }

    try {
        const transaction = await Transaction.create({
            discordId,
            type,
            amount: rawAmount,
            source,
            reason,
            metadata,
            idempotencyKey,
            balanceAfter,
        });
        // Log successful transaction for critical audit trail
        if (type === 'debit' && amount >= 100) {
            // Log high-value transactions
            await AdminAuditLog.create({
                action: 'high_value_transaction',
                targetId: discordId,
                actorId: 'economy-system',
                reason: `${type} ${rawAmount} from source=${source}`,
                metadata: { transactionId: String(transaction._id), source, amount: rawAmount, balanceAfter },
            }).catch(() => null);
        }
        return { reused: false, transaction, balanceAfter };
    } catch (err) {
        // Compensate wallet if ledger write fails so balance and ledger never drift silently.
        const compensation = type === 'credit'
            ? { $inc: { balance: -rawAmount, totalEarned: -rawAmount } }
            : { $inc: { balance: rawAmount, totalSpent: -rawAmount } };
        const compensationResult = await Wallet.findOneAndUpdate({ discordId }, compensation).catch((compErr) => {
            // CRITICAL: Compensation failed. Log this immediately as a system integrity issue.
            console.error(`[CRITICAL] Transaction compensation failed for ${discordId}:`, compErr.message);
            AdminAuditLog.create({
                action: 'transaction_compensation_failed',
                targetId: discordId,
                actorId: 'economy-system',
                reason: `Wallet/transaction desync: failed to compensate wallet after ledger write failure`,
                metadata: {
                    source,
                    reason,
                    amount: rawAmount,
                    type,
                    originalError: err.message,
                    compensationError: compErr.message,
                },
            }).catch(() => null);
            return null;
        });
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
        idempotencyKey: `shop-${discordId}-${item.id}-${now}`,
    });

    wallet.lastPurchaseAt = new Date();
    await wallet.save();

    return { item, balanceAfter: result.balanceAfter };
}

/**
 * Verify wallet balance consistency by comparing against transaction ledger.
 * Useful for detecting wallet/transaction desync from failed compensations.
 * Returns { consistent: boolean, wallet, calculatedBalance, discrepancy: number, issues: string[] }
 */
async function verifyWalletConsistency(discordId) {
    const wallet = await Wallet.findOne({ discordId });
    if (!wallet) return { consistent: true, wallet: null, reason: 'wallet_not_found' };

    const transactions = await Transaction.find({ discordId });
    let calculatedBalance = 0;
    let totalEarned = 0;
    let totalSpent = 0;
    const issues = [];

    for (const tx of transactions) {
        const amount = Number(tx.amount || 0);
        if (tx.type === 'credit') {
            calculatedBalance += amount;
            totalEarned += amount;
        } else if (tx.type === 'debit') {
            calculatedBalance -= amount;
            totalSpent += amount;
        }
        // Validate each transaction's balanceAfter
        if (Number(tx.balanceAfter) < 0) {
            issues.push(`Transaction ${tx._id} has negative balanceAfter: ${tx.balanceAfter}`);
        }
    }

    const walletBalance = Number(wallet.balance || 0);
    const walletEarned = Number(wallet.totalEarned || 0);
    const walletSpent = Number(wallet.totalSpent || 0);

    const discrepancy = Math.abs(walletBalance - calculatedBalance);
    const consistent = discrepancy === 0 && walletEarned === totalEarned && walletSpent === totalSpent;

    if (!consistent) {
        if (walletBalance !== calculatedBalance) {
            issues.push(`Balance mismatch: wallet=${walletBalance}, calculated=${calculatedBalance}, diff=${discrepancy}`);
        }
        if (walletEarned !== totalEarned) {
            issues.push(`TotalEarned mismatch: wallet=${walletEarned}, calculated=${totalEarned}`);
        }
        if (walletSpent !== totalSpent) {
            issues.push(`TotalSpent mismatch: wallet=${walletSpent}, calculated=${totalSpent}`);
        }
    }

    return {
        consistent,
        wallet,
        calculatedBalance,
        discrepancy,
        issues,
        transactionCount: transactions.length,
    };
}

module.exports = {
    ensureWallet,
    getWalletSummary,
    applyTransaction,
    getShopCatalog,
    buyShopItem,
    verifyWalletConsistency,
};
