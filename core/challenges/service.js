const ChallengeTemplate = require('../../models/ChallengeTemplate');
const PlayerChallengeProgress = require('../../models/PlayerChallengeProgress');
const { applyTransaction } = require('../economy/service');
const { awardXp } = require('../progression/service');

const DEFAULT_TEMPLATES = [
    {
        key: 'daily_drift_5000',
        title: 'Daily Drift Grinder',
        description: 'Earn 5,000 drift points today.',
        period: 'daily',
        metric: 'drift_points',
        target: 5000,
        rewardCoins: 250,
        rewardXp: 120,
    },
    {
        key: 'daily_clean_runs_3',
        title: 'Daily Clean Driver',
        description: 'Complete 3 clean runs today.',
        period: 'daily',
        metric: 'clean_runs',
        target: 3,
        rewardCoins: 180,
        rewardXp: 90,
    },
    {
        key: 'weekly_drift_30000',
        title: 'Weekly Drift Marathon',
        description: 'Earn 30,000 drift points this week.',
        period: 'weekly',
        metric: 'drift_points',
        target: 30000,
        rewardCoins: 900,
        rewardXp: 400,
    },
    {
        key: 'weekly_event_participation_5',
        title: 'Weekly Event Presence',
        description: 'Participate in 5 events this week.',
        period: 'weekly',
        metric: 'event_participation',
        target: 5,
        rewardCoins: 700,
        rewardXp: 320,
    },
];

function startOfUtcDay(date = new Date()) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function startOfUtcWeek(date = new Date()) {
    const d = startOfUtcDay(date);
    const day = d.getUTCDay();
    const diff = (day + 6) % 7; // Monday = 0
    d.setUTCDate(d.getUTCDate() - diff);
    return d;
}

function getPeriodWindow(period, now = new Date()) {
    const start = period === 'weekly' ? startOfUtcWeek(now) : startOfUtcDay(now);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + (period === 'weekly' ? 7 : 1));
    return { start, end };
}

async function ensureDefaultTemplates() {
    const count = await ChallengeTemplate.countDocuments({});
    if (count > 0) return;
    await ChallengeTemplate.insertMany(DEFAULT_TEMPLATES);
}

async function ensureChallengesForUser(discordId, period, desiredCount = 2) {
    await ensureDefaultTemplates();
    const { start, end } = getPeriodWindow(period);

    const existing = await PlayerChallengeProgress.find({
        discordId,
        period,
        periodStart: start,
    });
    if (existing.length >= desiredCount) return existing;

    const existingKeys = new Set(existing.map((c) => c.challengeKey));
    const templates = await ChallengeTemplate.find({ period, active: true }).sort({ weight: -1, key: 1 });

    const toCreate = [];
    for (const t of templates) {
        if (existingKeys.has(t.key)) continue;
        toCreate.push({
            discordId,
            challengeKey: t.key,
            period,
            periodStart: start,
            periodEnd: end,
            metric: t.metric,
            target: t.target,
            rewardCoins: t.rewardCoins,
            rewardXp: t.rewardXp,
            rewardRoleName: t.rewardRoleName,
        });
        if (existing.length + toCreate.length >= desiredCount) break;
    }

    if (toCreate.length) {
        await PlayerChallengeProgress.insertMany(toCreate, { ordered: false }).catch(() => null);
    }

    return PlayerChallengeProgress.find({
        discordId,
        period,
        periodStart: start,
    }).sort({ createdAt: 1 });
}

async function getActiveChallenges(discordId) {
    await ensureChallengesForUser(discordId, 'daily', 2);
    await ensureChallengesForUser(discordId, 'weekly', 2);

    const now = new Date();
    return PlayerChallengeProgress.find({
        discordId,
        periodEnd: { $gt: now },
    }).sort({ period: 1, createdAt: 1 });
}

async function recordChallengeMetric({ discordId, metric, amount = 1, autoClaim = false }) {
    const value = Math.max(0, Number(amount || 0));
    if (!value) return [];

    const now = new Date();
    const rows = await PlayerChallengeProgress.find({
        discordId,
        metric,
        claimed: false,
        periodEnd: { $gt: now },
    });

    const completed = [];

    for (const row of rows) {
        row.progress = Math.min(row.target, Number(row.progress || 0) + value);
        if (!row.completed && row.progress >= row.target) {
            row.completed = true;
            row.completedAt = new Date();
            completed.push(row);
        }
        await row.save();

        if (autoClaim && row.completed && !row.claimed) {
            await claimChallenge({ discordId, challengeProgressId: String(row._id) });
        }
    }

    return completed;
}

async function claimChallenge({ discordId, challengeProgressId }) {
    const row = await PlayerChallengeProgress.findOne({ _id: challengeProgressId, discordId });
    if (!row) throw new Error('Challenge progress entry not found.');
    if (!row.completed) throw new Error('Challenge not complete yet.');
    if (row.claimed) throw new Error('Challenge already claimed.');

    if (row.rewardCoins > 0) {
        await applyTransaction({
            discordId,
            amount: row.rewardCoins,
            type: 'credit',
            source: `challenge:${row.challengeKey}`,
            reason: `Challenge reward ${row.challengeKey}`,
            metadata: { challengeProgressId: String(row._id) },
            idempotencyKey: `challenge-coin-${row._id}`,
        });
    }

    if (row.rewardXp > 0) {
        await awardXp({
            discordId,
            amount: row.rewardXp,
            reason: `challenge:${row.challengeKey}`,
        });
    }

    row.claimed = true;
    row.claimedAt = new Date();
    await row.save();

    return row;
}

async function claimAllCompleted(discordId) {
    const rows = await PlayerChallengeProgress.find({ discordId, completed: true, claimed: false });
    const claimed = [];
    for (const row of rows) {
        claimed.push(await claimChallenge({ discordId, challengeProgressId: String(row._id) }));
    }
    return claimed;
}

module.exports = {
    getActiveChallenges,
    recordChallengeMetric,
    claimChallenge,
    claimAllCompleted,
};
