const DriverProfile     = require('../../models/DriverProfile');
const RaceEvent         = require('../../models/RaceEvent');
const RaceEventSchedule = require('../../models/RaceEventSchedule');
const RunSession        = require('../../models/RunSession');
const RunSubmission     = require('../../models/RunSubmission');
const Team              = require('../../models/Team');
const LeaderboardBan    = require('../../models/LeaderboardBan');
const { awardXp }       = require('../progression/service');
const { applyTransaction } = require('../economy/service');
const { applyMembershipBoosts } = require('../membership/service');
const { recordChallengeMetric } = require('../challenges/service');
const {
    calculateNoHesiPoints,
    getCircuitPointsByPosition,
    getTierFromPoints,
} = require('./points');

const TEAM_WIN_BONUS = 20;
const NO_HESI_XP_RATE = 0.5;
const NO_HESI_COIN_RATE = 0.3;
const CIRCUIT_XP_RATE = 1.5;
const CIRCUIT_COIN_RATE = 0.8;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function ensureDriverProfile(discordId, displayName) {
    let p = await DriverProfile.findOne({ discordId });
    if (!p) {
        p = await DriverProfile.create({ discordId, displayName: displayName || 'Unknown Driver' });
        return p;
    }
    if (displayName && p.displayName !== displayName) {
        p.displayName = displayName;
        await p.save();
    }
    return p;
}

async function recalculateTeamPoints(teamId) {
    if (!teamId) return null;
    const team = await Team.findById(teamId);
    if (!team) return null;
    const profiles = await DriverProfile.find({ discordId: { $in: team.members } });
    team.totalPoints  = profiles.reduce((s, p) => s + Number(p.teamContributionPoints || 0), 0);
    team.weeklyPoints = profiles.reduce((s, p) => s + Number(p.weeklyPoints || 0), 0);
    await team.save();
    return team;
}

async function applyTeamEventContribution(driverPointsMap) {
    const drivers = Object.keys(driverPointsMap || {});
    if (!drivers.length) return;

    const profiles    = await DriverProfile.find({ discordId: { $in: drivers } });
    const teamBuckets = new Map();

    for (const profile of profiles) {
        if (!profile.teamId) continue;
        const earned = Number(driverPointsMap[profile.discordId] || 0);
        const key    = String(profile.teamId);
        if (!teamBuckets.has(key)) teamBuckets.set(key, []);
        teamBuckets.get(key).push({ profile, earned });
    }

    for (const [teamId, entries] of teamBuckets) {
        entries.sort((a, b) => b.earned - a.earned);
        for (const item of entries.slice(0, 3)) {
            item.profile.teamContributionPoints += item.earned;
            await item.profile.save();
        }
        await recalculateTeamPoints(teamId);
    }
}

// ─── Run sessions ─────────────────────────────────────────────────────────────

async function startRunSession(discordId) {
    const active = await RunSession.findOne({ discordId, status: 'active' });
    if (active) throw new Error('You already have an active run session. End it first.');
    return RunSession.create({ discordId, startedAt: new Date(), status: 'active' });
}

async function endRunSession(discordId) {
    const active = await RunSession.findOne({ discordId, status: 'active' });
    if (!active) throw new Error('No active run session found. Use /run start first.');
    active.status  = 'ended';
    active.endedAt = new Date();
    await active.save();
    return active;
}

async function submitRun(params) {
    const {
        discordId, displayName, distanceMeters, timeSurvivedSec,
        topSpeed, crashes, cleanRun, proofUrl, clipUrl,
        adminVerifiedBy, mapName, vehicleName,
    } = params;

    if (!proofUrl && !clipUrl && !adminVerifiedBy) {
        throw new Error('Run submission requires proof URL, clip URL, or admin verification.');
    }

    const endedSession = await RunSession.findOne({ discordId, status: 'ended' }).sort({ endedAt: -1 });
    const points       = calculateNoHesiPoints({ distanceMeters, crashes, topSpeed, cleanRun });
    const antiCheatStatus = adminVerifiedBy ? 'verified' : 'pending';

    const suspiciousReasons = [];
    if (Number(distanceMeters) > 500000) suspiciousReasons.push('distance_too_high');
    if (Number(topSpeed) > 450) suspiciousReasons.push('top_speed_too_high');
    if (Number(timeSurvivedSec) > 21600) suspiciousReasons.push('time_too_high');
    if (Number(points.total) > 10000) suspiciousReasons.push('points_spike');

    const finalAntiCheatStatus = suspiciousReasons.length > 0 && !adminVerifiedBy
        ? 'pending'
        : antiCheatStatus;

    const submission = await RunSubmission.create({
        discordId,
        sessionId:       endedSession?._id ?? null,
        distanceMeters, timeSurvivedSec, topSpeed, crashes, cleanRun,
        proofUrl:        proofUrl    || null,
        clipUrl:         clipUrl     || null,
        adminVerifiedBy: adminVerifiedBy || null,
        pointsAwarded:   points.total,
        antiCheatStatus: finalAntiCheatStatus,
        mapName:         mapName     || null,
        vehicleName:     vehicleName || null,
        antiCheatMeta:   suspiciousReasons.length ? { suspiciousReasons } : {},
    });

    if (endedSession) {
        endedSession.status = 'submitted';
        await endedSession.save();
    }

    const profile = await ensureDriverProfile(discordId, displayName);
    profile.noHesiRuns         += 1;
    profile.totalPoints        += points.total;
    profile.streetPoints       += points.total;
    profile.weeklyPoints       += points.total;
    profile.weeklyStreetPoints += points.total;
    if (cleanRun) profile.cleanRuns += 1;
    profile.noCrashStreak      = crashes === 0 ? profile.noCrashStreak + 1 : 0;
    profile.bestNoHesiDistance = Math.max(profile.bestNoHesiDistance || 0, Number(distanceMeters));
    profile.bestNoHesiTopSpeed = Math.max(profile.bestNoHesiTopSpeed || 0, Number(topSpeed));
    profile.cleanDriverRank    = profile.noHesiRuns > 0 ? Number(((profile.cleanRuns / profile.noHesiRuns) * 100).toFixed(2)) : 0;
    profile.tier               = getTierFromPoints(profile.totalPoints);
    await profile.save();

    if (profile.teamId) {
        profile.teamContributionPoints += points.total;
        await profile.save();
        await recalculateTeamPoints(profile.teamId);
    }

    const earnedXp = Math.max(10, Math.round(points.total * NO_HESI_XP_RATE));
    const earnedCoins = Math.max(5, Math.round(points.total * NO_HESI_COIN_RATE));
    const boostedRewards = await applyMembershipBoosts({
        discordId,
        xp: earnedXp,
        coins: earnedCoins,
    });

    let progression = null;
    if (!suspiciousReasons.length || adminVerifiedBy) {
        try {
            progression = await awardXp({
                discordId,
                amount: boostedRewards.xp,
                reason: 'no_hesi_submission',
            });
            await applyTransaction({
                discordId,
                amount: boostedRewards.coins,
                type: 'credit',
                source: 'run_submission_reward',
                reason: 'No Hesi run reward',
                metadata: { submissionId: String(submission._id) },
                idempotencyKey: `run-reward-${submission._id}`,
            });
            await recordChallengeMetric({ discordId, metric: 'drift_points', amount: points.total });
            if (cleanRun) await recordChallengeMetric({ discordId, metric: 'clean_runs', amount: 1 });
        } catch (err) {
            console.warn('Reward processing failed for run submission:', err.message);
        }
    }

    return {
        submission,
        points,
        progression,
        earnedCoins: (!suspiciousReasons.length || adminVerifiedBy) ? boostedRewards.coins : 0,
        suspiciousReasons,
    };
}

// ─── Races ────────────────────────────────────────────────────────────────────

async function createRace({ raceName, trackName, createdByDiscordId, season }) {
    const existing = await RaceEvent.findOne({ raceName, status: { $in: ['created', 'started'] } });
    if (existing) throw new Error('A race with this name is already open.');
    return RaceEvent.create({ raceName, trackName: trackName || '', createdByDiscordId, season: season || 'S1', status: 'created', participants: [], results: [] });
}

async function joinRace({ raceName, discordId }) {
    const race = await RaceEvent.findOne({ raceName, status: { $in: ['created', 'started'] } }).sort({ createdAt: -1 });
    if (!race)                  throw new Error('Race not found or no longer open.');
    if (race.status !== 'created') throw new Error('Race already started.');
    race.participants = [...new Set([...race.participants, discordId])];
    await race.save();
    return race;
}

async function startRace({ raceName }) {
    const race = await RaceEvent.findOne({ raceName, status: 'created' }).sort({ createdAt: -1 });
    if (!race) throw new Error('Race not found or already started/completed.');
    race.status = 'started';
    await race.save();
    return race;
}

async function submitRaceResults({ raceId, raceName, results, submittedByDiscordId }) {
    const query = raceId ? { _id: raceId } : { raceName, status: { $in: ['created', 'started'] } };
    const race  = await RaceEvent.findOne(query).sort({ createdAt: -1 });
    if (!race)                      throw new Error('Race not found.');
    if (race.status === 'completed') throw new Error('Results already submitted.');

    const normalizedResults = [];
    const driverPointsMap   = {};

    for (const row of results) {
        const position = Number(row.position);
        const pts      = row.dnf ? 0 : getCircuitPointsByPosition(position);
        normalizedResults.push({ discordId: row.discordId, position, dnf: !!row.dnf, pointsAwarded: pts, lapTimes: row.lapTimes || [] });
        driverPointsMap[row.discordId] = pts;
    }

    race.results = normalizedResults;
    race.status  = 'completed';
    await race.save();

    // Update driver profiles
    for (const row of normalizedResults) {
        const p = await ensureDriverProfile(row.discordId, null);
        p.totalPoints        += row.pointsAwarded;
        p.circuitPoints      += row.pointsAwarded;
        p.weeklyPoints       += row.pointsAwarded;
        p.weeklyCircuitPoints = (p.weeklyCircuitPoints || 0) + row.pointsAwarded;
        p.tier               = getTierFromPoints(p.totalPoints);
        await p.save();

        const earnedXp = Math.max(5, Math.round(row.pointsAwarded * CIRCUIT_XP_RATE));
        const earnedCoins = Math.max(3, Math.round(row.pointsAwarded * CIRCUIT_COIN_RATE));
        try {
            const boostedRewards = await applyMembershipBoosts({
                discordId: row.discordId,
                xp: earnedXp,
                coins: earnedCoins,
            });
            await awardXp({
                discordId: row.discordId,
                amount: boostedRewards.xp,
                reason: 'circuit_result',
            });
            await applyTransaction({
                discordId: row.discordId,
                amount: boostedRewards.coins,
                type: 'credit',
                source: 'race_result_reward',
                reason: 'Circuit race reward',
                metadata: { raceId: String(race._id), position: row.position },
                idempotencyKey: `race-reward-${race._id}-${row.discordId}`,
            });
            await recordChallengeMetric({ discordId: row.discordId, metric: 'event_participation', amount: 1 });
        } catch (err) {
            console.warn('Reward processing failed for race result:', err.message);
        }
    }

    await applyTeamEventContribution(driverPointsMap);

    // Team win bonus for team with most top-3 drivers
    const top3 = normalizedResults.filter((r) => r.position <= 3 && !r.dnf);
    if (top3.length) {
        const teamCount = new Map();
        const top3Profiles = await DriverProfile.find({ discordId: { $in: top3.map((r) => r.discordId) } });
        for (const p of top3Profiles) {
            if (!p.teamId) continue;
            const k = String(p.teamId);
            teamCount.set(k, (teamCount.get(k) || 0) + 1);
        }
        if (teamCount.size) {
            const [winningTeamId] = [...teamCount.entries()].sort((a, b) => b[1] - a[1])[0];
            const winningTeam = await Team.findById(winningTeamId);
            if (winningTeam) {
                winningTeam.teamWins    += 1;
                winningTeam.totalPoints += TEAM_WIN_BONUS;
                await winningTeam.save();
                const members = await DriverProfile.find({ teamId: winningTeam._id });
                for (const m of members) { m.teamWins += 1; await m.save(); }
            }
        }
    }

    return race;
}

// ─── Teams ────────────────────────────────────────────────────────────────────

async function createTeam({ name, captainDiscordId }) {
    if (await Team.findOne({ name })) throw new Error('Team name already taken.');
    const team    = await Team.create({ name, captainDiscordId, members: [captainDiscordId] });
    const captain = await ensureDriverProfile(captainDiscordId, null);
    captain.teamId = team._id;
    await captain.save();
    return team;
}

async function joinTeam({ name, discordId, displayName }) {
    const team = await Team.findOne({ name });
    if (!team) throw new Error('Team not found.');
    if (team.members.includes(discordId)) return team;
    const profile = await ensureDriverProfile(discordId, displayName);
    if (profile.teamId && String(profile.teamId) !== String(team._id)) {
        throw new Error('You are already in another team. Leave it first.');
    }
    team.members = [...new Set([...team.members, discordId])];
    await team.save();
    profile.teamId = team._id;
    await profile.save();
    await recalculateTeamPoints(team._id);
    return team;
}

async function getTeamStats(name) {
    const team = await Team.findOne({ name });
    if (!team) return null;
    const profiles = await DriverProfile.find({ discordId: { $in: team.members } }).sort({ totalPoints: -1 });
    return { team, profiles };
}

// ─── Leaderboards ─────────────────────────────────────────────────────────────

async function getLeaderboard(type, limit = 10, weekly = false) {
    const bannedIds = await LeaderboardBan.distinct('discordId', { active: true });

    if (type === 'teams') {
        return Team.find({}).sort(weekly ? { weeklyPoints: -1 } : { totalPoints: -1 }).limit(limit);
    }

    const sortMap = {
        solo:    weekly ? { weeklyPoints: -1 }        : { totalPoints: -1 },
        street:  weekly ? { weeklyStreetPoints: -1 }  : { streetPoints: -1 },
        circuit: weekly ? { weeklyCircuitPoints: -1 } : { circuitPoints: -1 },
    };
    const query = bannedIds.length ? { discordId: { $nin: bannedIds } } : {};
    return DriverProfile.find(query).sort(sortMap[type] || sortMap.solo).limit(limit);
}

async function getDriverStats(discordId) {
    return DriverProfile.findOne({ discordId }).populate('teamId');
}

async function getDriverRank(discordId, type = 'solo', weekly = false) {
    const profile = await DriverProfile.findOne({ discordId });
    if (!profile) return null;

    const banned = await LeaderboardBan.findOne({ discordId, active: true });
    if (banned) return null;

    const bannedIds = await LeaderboardBan.distinct('discordId', { active: true });
    const fieldMap = {
        solo:    weekly ? 'weeklyPoints'        : 'totalPoints',
        street:  weekly ? 'weeklyStreetPoints'  : 'streetPoints',
        circuit: weekly ? 'weeklyCircuitPoints' : 'circuitPoints',
    };
    const field = fieldMap[type] || fieldMap.solo;
    const score = Number(profile[field] || 0);
    const query = bannedIds.length
        ? { [field]: { $gt: score }, discordId: { $nin: bannedIds } }
        : { [field]: { $gt: score } };
    return (await DriverProfile.countDocuments(query)) + 1;
}

async function getTeamRank(teamId, weekly = false) {
    if (!teamId) return null;
    const field = weekly ? 'weeklyPoints' : 'totalPoints';
    const team  = await Team.findById(teamId);
    if (!team) return null;
    return (await Team.countDocuments({ [field]: { $gt: Number(team[field] || 0) } })) + 1;
}

async function resetWeeklyPoints() {
    await DriverProfile.updateMany({}, { $set: { weeklyPoints: 0, weeklyStreetPoints: 0, weeklyCircuitPoints: 0 } });
    await Team.updateMany({}, { $set: { weeklyPoints: 0 } });
}

// ─── Map / Vehicle leaderboards ───────────────────────────────────────────────

async function getMapLeaderboard(mapName, limit = 10) {
    return RunSubmission.aggregate([
        { $match: { mapName, antiCheatStatus: { $ne: 'rejected' } } },
        { $sort: { topSpeed: -1 } },
        { $group: { _id: '$discordId', topSpeed: { $max: '$topSpeed' }, distanceMeters: { $max: '$distanceMeters' } } },
        { $sort: { topSpeed: -1 } },
        { $limit: limit },
    ]);
}

async function getMapIndex() {
    return RunSubmission.distinct('mapName', { mapName: { $ne: null }, antiCheatStatus: { $ne: 'rejected' } });
}

async function getVehicleLeaderboard(limit = 10, vehicleName) {
    const match = { antiCheatStatus: { $ne: 'rejected' }, vehicleName: { $ne: null } };
    if (vehicleName) match.vehicleName = vehicleName;
    return RunSubmission.aggregate([
        { $match: match },
        { $sort: { topSpeed: -1 } },
        { $group: { _id: vehicleName ? '$discordId' : '$vehicleName', topSpeed: { $max: '$topSpeed' }, distanceMeters: { $max: '$distanceMeters' }, discordId: { $first: '$discordId' }, runs: { $sum: 1 } } },
        { $sort: { topSpeed: -1 } },
        { $limit: limit },
    ]);
}

// ─── Scheduled events ─────────────────────────────────────────────────────────

async function createScheduledEvent({ title, description, startsAt, createdByDiscordId, targetRoleId, channelId }) {
    const when = new Date(startsAt);
    if (Number.isNaN(when.getTime())) throw new Error('Invalid event date/time.');
    if (when.getTime() < Date.now() + 60000) throw new Error('Event start must be at least 1 minute in the future.');
    return RaceEventSchedule.create({ title, description: description || '', startsAt: when, createdByDiscordId, targetRoleId: targetRoleId || null, channelId: channelId || null, remindersSentMinutes: [], status: 'scheduled' });
}

async function listScheduledEvents(limit = 10) {
    return RaceEventSchedule.find({ status: 'scheduled' }).sort({ startsAt: 1 }).limit(limit);
}

// ─── Anti-cheat review ────────────────────────────────────────────────────────

async function listPendingRunSubmissions(limit = 10) {
    return RunSubmission.find({ antiCheatStatus: 'pending' }).sort({ createdAt: -1 }).limit(limit);
}

async function reviewRunSubmission({ submissionId, approve, reviewerDiscordId }) {
    const submission = await RunSubmission.findById(submissionId);
    if (!submission) throw new Error('Run submission not found.');
    if (submission.antiCheatStatus !== 'pending') throw new Error('Already reviewed.');

    const profile = await ensureDriverProfile(submission.discordId, null);

    if (approve) {
        submission.antiCheatStatus = 'verified';
        submission.adminVerifiedBy = reviewerDiscordId;
        await submission.save();
        return submission;
    }

    submission.antiCheatStatus = 'rejected';
    submission.adminVerifiedBy = reviewerDiscordId;
    await submission.save();

    const rollback = Number(submission.pointsAwarded || 0);
    profile.totalPoints        = Math.max(0, profile.totalPoints        - rollback);
    profile.streetPoints       = Math.max(0, profile.streetPoints       - rollback);
    profile.weeklyPoints       = Math.max(0, profile.weeklyPoints       - rollback);
    profile.weeklyStreetPoints = Math.max(0, profile.weeklyStreetPoints - rollback);
    profile.tier               = getTierFromPoints(profile.totalPoints);
    await profile.save();

    if (profile.teamId) {
        profile.teamContributionPoints = Math.max(0, Number(profile.teamContributionPoints || 0) - rollback);
        await profile.save();
        await recalculateTeamPoints(profile.teamId);
    }

    return submission;
}

module.exports = {
    ensureDriverProfile,
    startRunSession,
    endRunSession,
    submitRun,
    createRace,
    joinRace,
    startRace,
    submitRaceResults,
    createTeam,
    joinTeam,
    getTeamStats,
    getLeaderboard,
    getDriverStats,
    getDriverRank,
    getTeamRank,
    resetWeeklyPoints,
    getMapLeaderboard,
    getMapIndex,
    getVehicleLeaderboard,
    createScheduledEvent,
    listScheduledEvents,
    listPendingRunSubmissions,
    reviewRunSubmission,
};
