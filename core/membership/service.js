const Membership = require('../../models/Membership');
const { applyTransaction } = require('../economy/service');

const TIERS = {
    none:   { xp: 1.0, drift: 1.0, monthlyCost: 0 },
    bronze: { xp: 1.1, drift: 1.05, monthlyCost: 500 },
    silver: { xp: 1.2, drift: 1.1, monthlyCost: 900 },
    gold:   { xp: 1.35, drift: 1.2, monthlyCost: 1400 },
};

function getTierConfig(tier) {
    return TIERS[tier] || TIERS.none;
}

async function getMembership(discordId) {
    const row = await Membership.findOne({ discordId });
    if (!row) {
        return {
            tier: 'none',
            active: false,
            xpBoostMultiplier: 1,
            driftBoostMultiplier: 1,
            expiresAt: null,
        };
    }

    if (row.active && row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
        row.active = false;
        row.tier = 'none';
        row.xpBoostMultiplier = 1;
        row.driftBoostMultiplier = 1;
        await row.save();
    }

    return row;
}

async function applyMembershipBoosts({ discordId, xp = 0, coins = 0 }) {
    const membership = await getMembership(discordId);
    if (!membership.active) {
        return { xp: Math.round(xp), coins: Math.round(coins), tier: 'none' };
    }

    const boostedXp = Math.round(Number(xp || 0) * Number(membership.xpBoostMultiplier || 1));
    const boostedCoins = Math.round(Number(coins || 0) * Number(membership.driftBoostMultiplier || 1));
    return {
        xp: boostedXp,
        coins: boostedCoins,
        tier: membership.tier,
        xpMultiplier: membership.xpBoostMultiplier,
        driftMultiplier: membership.driftBoostMultiplier,
    };
}

async function syncMembership({ discordId, tier, expiresAt, source = 'webhook', purchaseRef = null }) {
    const safeTier = TIERS[tier] ? tier : 'none';
    const cfg = getTierConfig(safeTier);
    const expiry = expiresAt ? new Date(expiresAt) : null;
    const active = safeTier !== 'none' && !!expiry && expiry.getTime() > Date.now();

    let row = await Membership.findOne({ discordId });
    if (!row) {
        row = await Membership.create({ discordId });
    }

    row.tier = safeTier;
    row.active = active;
    row.source = source;
    row.purchaseRef = purchaseRef;
    row.startsAt = active ? new Date() : row.startsAt;
    row.expiresAt = expiry;
    row.xpBoostMultiplier = cfg.xp;
    row.driftBoostMultiplier = cfg.drift;
    row.syncedAt = new Date();
    await row.save();

    return row;
}

async function upgradeMembership({ discordId, tier, months = 1, idempotencyKey = null }) {
    const safeTier = TIERS[tier] ? tier : null;
    if (!safeTier || safeTier === 'none') throw new Error('Invalid membership tier.');
    const billingMonths = Math.max(1, Math.floor(Number(months || 1)));
    const cfg = getTierConfig(safeTier);
    const cost = cfg.monthlyCost * billingMonths;

    await applyTransaction({
        discordId,
        amount: cost,
        type: 'debit',
        source: `membership:${safeTier}`,
        reason: `Membership upgrade to ${safeTier} (${billingMonths} month)` + (billingMonths > 1 ? 's' : ''),
        idempotencyKey,
    });

    const current = await Membership.findOne({ discordId });
    const now = new Date();
    const base = current?.active && current?.expiresAt && current.expiresAt > now ? new Date(current.expiresAt) : now;
    const expiresAt = new Date(base);
    expiresAt.setUTCMonth(expiresAt.getUTCMonth() + billingMonths);

    return syncMembership({
        discordId,
        tier: safeTier,
        expiresAt,
        source: 'discord_upgrade',
        purchaseRef: `discord-${discordId}-${Date.now()}`,
    });
}

module.exports = {
    TIERS,
    getMembership,
    applyMembershipBoosts,
    syncMembership,
    upgradeMembership,
};
