const DriverProfile = require('../../models/DriverProfile');
const LeaderboardBan = require('../../models/LeaderboardBan');
const AdminAuditLog = require('../../models/AdminAuditLog');
const { getTierFromPoints } = require('../racing/points');
const { ensureDriverProfile, resetWeeklyPoints } = require('../racing/service');

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

module.exports = {
    adjustPlayerPoints,
    setLeaderboardBan,
    clearLeaderboardBan,
    resetWeeklyBoards,
};
