const DriverProfile = require('../../models/DriverProfile');
const LeaderboardBan = require('../../models/LeaderboardBan');
const AdminAuditLog = require('../../models/AdminAuditLog');
const { getTierFromPoints } = require('../racing/points');
const { ensureDriverProfile, resetWeeklyPoints } = require('../racing/service');
const { reloadTrafficRiskWeights } = require('../integration/desktopDashboardService');

async function logAdminAction({ action, targetId, actorId, reason = '', metadata = {} }) {
    await AdminAuditLog.create({ action, targetId, actorId, reason, metadata });
}

async function adjustPlayerPoints({ targetDiscordId, deltaPoints, actorDiscordId, reason = '' }) {
    const delta = Math.trunc(Number(deltaPoints || 0));
    if (!delta) throw new Error('Delta points must be non-zero.');

    const profile = await ensureDriverProfile(targetDiscordId, null);
    profile.totalPoints = Math.max(0, Number(profile.totalPoints || 0) + delta);
    profile.weeklyPoints = Math.max(0, Number(profile.weeklyPoints || 0) + delta);
    profile.tier = getTierFromPoints(profile.totalPoints);
    await profile.save();

    await logAdminAction({
        action: 'adjust_points',
        targetId: targetDiscordId,
        actorId: actorDiscordId,
        reason,
        metadata: { deltaPoints: delta, totalPoints: profile.totalPoints },
    });

    return profile;
}

async function setLeaderboardBan({ targetDiscordId, actorDiscordId, reason = '' }) {
    const existing = await LeaderboardBan.findOne({ discordId: targetDiscordId });
    if (existing) {
        existing.active = true;
        existing.reason = reason || existing.reason;
        existing.imposedBy = actorDiscordId;
        existing.imposedAt = new Date();
        await existing.save();
    } else {
        await LeaderboardBan.create({
            discordId: targetDiscordId,
            reason,
            imposedBy: actorDiscordId,
            active: true,
        });
    }

    await logAdminAction({
        action: 'leaderboard_ban',
        targetId: targetDiscordId,
        actorId: actorDiscordId,
        reason,
    });
}

async function clearLeaderboardBan({ targetDiscordId, actorDiscordId, reason = '' }) {
    const existing = await LeaderboardBan.findOne({ discordId: targetDiscordId, active: true });
    if (!existing) return false;

    existing.active = false;
    await existing.save();

    await logAdminAction({
        action: 'leaderboard_unban',
        targetId: targetDiscordId,
        actorId: actorDiscordId,
        reason,
    });

    return true;
}

async function resetWeeklyBoards({ actorDiscordId, reason = 'manual reset' }) {
    await resetWeeklyPoints();
    await logAdminAction({
        action: 'reset_weekly_boards',
        targetId: 'system',
        actorId: actorDiscordId,
        reason,
    });
}

async function reloadTrafficRiskWeightsConfig({ actorDiscordId, reason = 'manual reload' }) {
    const weights = reloadTrafficRiskWeights();
    await logAdminAction({
        action: 'reload_traffic_risk_weights',
        targetId: 'system',
        actorId: actorDiscordId,
        reason,
        metadata: { weights },
    });
    return weights;
}

async function triggerTelemetryLeaderboardPost({ actorDiscordId, reason = 'manual post', dryRun = false }) {
    const base = String(process.env.TELEMETRY_API_BASE || 'http://127.0.0.1:3000').trim().replace(/\/$/, '');
    const token = String(process.env.TELEMETRY_ADMIN_TOKEN || '').trim();

    const target = new URL('/api/run/leaderboard/post', base);
    target.searchParams.set('dryRun', dryRun ? 'true' : 'false');
    target.searchParams.set('force', 'true');
    target.searchParams.set('reason', reason);

    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['x-telemetry-admin-token'] = token;
    }

    const response = await fetch(target.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify({ dryRun, force: true, reason }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `telemetry_post_failed_${response.status}`);
    }

    await logAdminAction({
        action: 'telemetry_leaderboard_post',
        targetId: 'system',
        actorId: actorDiscordId,
        reason,
        metadata: {
            dryRun: !!dryRun,
            result: payload.result || {},
        },
    });

    return payload.result || {};
}

module.exports = {
    adjustPlayerPoints,
    setLeaderboardBan,
    clearLeaderboardBan,
    resetWeeklyBoards,
    reloadTrafficRiskWeightsConfig,
    triggerTelemetryLeaderboardPost,
};
