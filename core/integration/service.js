const IngestEvent = require('../../models/IngestEvent');
const DriverProfile = require('../../models/DriverProfile');
const AdminAuditLog = require('../../models/AdminAuditLog');
const { ensureDriverProfile } = require('../racing/service');
const { awardXp } = require('../progression/service');
const { applyTransaction } = require('../economy/service');
const { applyMembershipBoosts, syncMembership } = require('../membership/service');
const { recordChallengeMetric } = require('../challenges/service');
const { getTierFromPoints } = require('../racing/points');
const {
    dispatchLevelUp,
    dispatchBigScore,
} = require('../notifications/dispatcher');

function validateIngestEvent(eventType, payload = {}) {
    if (!eventType) return { ok: false, reason: 'missing_event_type' };

    if (eventType === 'drift.points') {
        const points = Number(payload.points || 0);
        const topSpeed = Number(payload.topSpeed || 0);
        if (!Number.isFinite(points) || points <= 0) return { ok: false, reason: 'invalid_points' };
        if (points > 5000) return { ok: false, reason: 'points_spike' };
        if (topSpeed > 450) return { ok: false, reason: 'speed_spike' };
    }

    if (eventType === 'tap.used') {
        const tapsUsed = Number(payload.tapsUsed || 0);
        if (!Number.isFinite(tapsUsed) || tapsUsed < 0 || tapsUsed > 3) {
            return { ok: false, reason: 'invalid_taps_used' };
        }
    }

    if (eventType === 'membership.sync') {
        if (!payload.tier) return { ok: false, reason: 'missing_tier' };
        if (!payload.expiresAt) return { ok: false, reason: 'missing_expires_at' };
    }

    return { ok: true };
}

async function markSuspicious({ eventType, discordId, reason, payload }) {
    await AdminAuditLog.create({
        action: 'suspicious_ingest',
        targetId: discordId,
        actorId: 'integration-layer',
        reason,
        metadata: { eventType, payload },
    });
}

async function processDriftPoints({ eventId, discordId, payload }) {
    const points = Math.max(0, Math.round(Number(payload.points || 0)));
    const xpBase = Math.max(5, Math.round(points * 0.25));
    const coinBase = Math.max(3, Math.round(points * 0.15));

    const boosted = await applyMembershipBoosts({ discordId, xp: xpBase, coins: coinBase });

    const profile = await ensureDriverProfile(discordId, payload.displayName || null);
    profile.totalPoints += points;
    profile.streetPoints += points;
    profile.weeklyPoints += points;
    profile.weeklyStreetPoints += points;
    profile.tier = getTierFromPoints(profile.totalPoints);
    await profile.save();

    const progression = await awardXp({ discordId, amount: boosted.xp, reason: 'integration_drift_points' });
    await applyTransaction({
        discordId,
        amount: boosted.coins,
        type: 'credit',
        source: 'integration_drift_points',
        reason: 'Drift points ingest reward',
        idempotencyKey: `drift-points-${eventId}`,
    });

    await recordChallengeMetric({ discordId, metric: 'drift_points', amount: points });

    // ── Notifications (fire-and-forget) ──────────────────────────────────────
    const dName = payload.displayName || profile.displayName;
    if (progression?.leveledUp) {
        dispatchLevelUp({
            discordId,
            displayName: dName,
            oldLevel: progression.oldLevel,
            newLevel: progression.newLevel,
        }).catch(() => null);
    }
    dispatchBigScore({ discordId, displayName: dName, points }).catch(() => null);
}

async function processEventWin({ eventId, discordId }) {
    const profile = await ensureDriverProfile(discordId, null);
    profile.teamWins = Number(profile.teamWins || 0) + 1;
    await profile.save();

    await awardXp({ discordId, amount: 120, reason: 'integration_event_win' });
    await applyTransaction({
        discordId,
        amount: 250,
        type: 'credit',
        source: 'integration_event_win',
        reason: 'Event win reward',
        idempotencyKey: `event-win-${eventId}`,
    });

    await recordChallengeMetric({ discordId, metric: 'event_participation', amount: 1 });
}

async function processTapUsed({ eventId, discordId, payload }) {
    const profile = await ensureDriverProfile(discordId, payload.displayName || null);
    const tapsUsed = Math.max(0, Math.min(3, Number(payload.tapsUsed || 0)));

    const xpBonus = Math.max(5, Math.round(50 * (tapsUsed + 1)));
    const coinBonus = Math.max(3, Math.round(25 * (tapsUsed + 1)));

    const boosted = await applyMembershipBoosts({ discordId, xp: xpBonus, coins: coinBonus });

    profile.tapsUsed = tapsUsed;
    profile.totalTapsUsed = Number(profile.totalTapsUsed || 0) + 1;
    await profile.save();

    await awardXp({ discordId, amount: boosted.xp, reason: 'tap_boost_used' });
    await applyTransaction({
        discordId,
        amount: boosted.coins,
        type: 'credit',
        source: 'tap_boost_reward',
        reason: `Tap boost reward (×${tapsUsed + 1})`,
        idempotencyKey: `tap-used-${eventId}`,
    });
}

async function processExternalEvent({ eventId, eventType, discordId, payload = {} }) {
    const existing = await IngestEvent.findOne({ eventId });
    if (existing) {
        return { accepted: true, duplicate: true, reason: 'duplicate_event' };
    }

    const validation = validateIngestEvent(eventType, payload);
    if (!validation.ok) {
        await IngestEvent.create({
            eventId,
            eventType,
            discordId,
            accepted: false,
            reason: validation.reason,
            payload,
        });
        await markSuspicious({ eventType, discordId, reason: validation.reason, payload });
        return { accepted: false, duplicate: false, reason: validation.reason };
    }

    if (eventType === 'drift.points') {
        await processDriftPoints({ eventId, discordId, payload });
    } else if (eventType === 'drift.clean_run') {
        const profile = await ensureDriverProfile(discordId, payload.displayName || null);
        profile.noHesiRuns = Number(profile.noHesiRuns || 0) + 1;
        profile.cleanRuns = Number(profile.cleanRuns || 0) + 1;
        profile.noCrashStreak = Number(profile.noCrashStreak || 0) + 1;
        await profile.save();
        await recordChallengeMetric({ discordId, metric: 'clean_runs', amount: 1 });
    } else if (eventType === 'event.participation') {
        await recordChallengeMetric({ discordId, metric: 'event_participation', amount: 1 });
    } else if (eventType === 'event.win') {
        await processEventWin({ eventId, discordId });
    } else if (eventType === 'tap.used') {
        await processTapUsed({ eventId, discordId, payload });
    } else if (eventType === 'membership.sync') {
        await syncMembership({
            discordId,
            tier: payload.tier,
            expiresAt: payload.expiresAt,
            source: payload.source || 'fivem_webhook',
            purchaseRef: payload.purchaseRef || null,
        });
    }

    await IngestEvent.create({
        eventId,
        eventType,
        discordId,
        accepted: true,
        reason: '',
        payload,
    });

    return { accepted: true, duplicate: false, reason: '' };
}

async function getPlayerHudState(discordId) {
    const profile = await DriverProfile.findOne({ discordId });
    if (!profile) {
        return null;
    }

    const { xpRequiredForLevel } = require('../progression/service');
    const nextLevelXp = xpRequiredForLevel(profile.level);
    const xpPercent = Math.min(100, Math.round(((profile.xp || 0) / Math.max(1, nextLevelXp)) * 100));

    const isPro = profile.level >= 10;
    const proTier = isPro ? (profile.proTier || 'Pro') : 'Certified';

    return {
        discordId,
        displayName: profile.displayName,
        rank: proTier,
        isPro,
        level: profile.level,
        xpPercent,
        tier: profile.tier,
        tapsUsed: Math.max(0, Math.min(3, profile.tapsUsed || 0)),
        tapsMax: profile.tapsMax || 3,
    };
}

module.exports = {
    processExternalEvent,
    getPlayerHudState,
};
