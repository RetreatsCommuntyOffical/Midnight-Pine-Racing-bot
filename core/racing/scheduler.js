'use strict';
const RaceEventSchedule = require('../../models/RaceEventSchedule');
const DailyDigestState  = require('../../models/DailyDigestState');
const { processScheduledReleases } = require('./releaseService');
const { processDailyDigest } = require('./dailyDigestService');
const { resetWeeklyPoints, getLeaderboard } = require('./service');
const { dispatchWeeklyReset } = require('../notifications/dispatcher');
const { eventEmbed, rows, Buttons, ts } = require('../ui/theme');

const WEEKLY_RESET_STATE_KEY = 'weekly-reset';

let timer = null;

const REMINDER_WINDOWS = [60, 15, 5]; // minutes before event

function buildReminderEmbed(evt, minsUntil) {
    const isNow     = minsUntil <= 1;
    const countdown = isNow ? '**starting NOW** 🚦' : `starting in **${minsUntil} minute${minsUntil !== 1 ? 's' : ''}**`;
    return eventEmbed({
        title:       `🏁 ${evt.title}`,
        description: `${evt.description ? `${evt.description}\n\n` : ''}The race is ${countdown}`,
        fields: [
            { name: '🗓️ Starts',    value: ts(evt.startsAt, 'F'),  inline: true },
            { name: '⏰ Countdown', value: ts(evt.startsAt, 'R'),  inline: true },
        ],
        footer: isNow ? 'GET TO THE STARTING LINE!' : `Reminder · ${minsUntil} min warning`,
    });
}

async function processReminders(client) {
    if (!client?.isReady?.()) return;

    const now   = new Date();
    const upper = new Date(now.getTime() + 61 * 60 * 1000);
    const events = await RaceEventSchedule.find({ status: 'scheduled', startsAt: { $lte: upper } });

    const HOME_GUILD_ID = process.env.HOME_GUILD_ID;
    const guild = (HOME_GUILD_ID && client.guilds.cache.get(HOME_GUILD_ID)) || client.guilds.cache.first();

    for (const evt of events) {
        const minsUntil = Math.floor((evt.startsAt.getTime() - now.getTime()) / 60000);

        for (const window of REMINDER_WINDOWS) {
            if (minsUntil <= window && !evt.remindersSentMinutes.includes(window)) {
                const channel = evt.channelId
                    ? guild?.channels.cache.get(evt.channelId)
                    : guild?.channels.cache.find((c) => c.name === '📅┃events' && c.isTextBased());

                if (channel) {
                    const ping    = evt.targetRoleId ? `<@&${evt.targetRoleId}>` : '';
                    const embed   = buildReminderEmbed(evt, minsUntil);
                    const btnRow  = rows([Buttons.joinEvent(evt.title)]);
                    await channel.send({
                        content:    ping || undefined,
                        embeds:     [embed],
                        components: btnRow,
                    }).catch(() => null);
                }

                evt.remindersSentMinutes.push(window);
                await evt.save();
            }
        }

        if (evt.startsAt <= now && !evt.remindersSentMinutes.includes(0)) {
            evt.status = 'started';
            await evt.save();
        }
    }
}

// ── Weekly leaderboard reset ──────────────────────────────────────────────────
// Runs every Monday at or after 09:00 UTC. Uses DailyDigestState for idempotency.

async function processWeeklyReset() {
    const now = new Date();
    // UTC weekday: 0=Sunday … 1=Monday
    if (now.getUTCDay() !== 1) return;
    // Only run at/after 09:00 UTC
    if (now.getUTCHours() < 9) return;

    // ISO week key: e.g. "2026-W17"
    const jan1 = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((now - jan1) / 86400000 + jan1.getUTCDay() + 1) / 7);
    const weekKey = `${now.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;

    let state = await DailyDigestState.findOne({ digestKey: WEEKLY_RESET_STATE_KEY });
    if (state?.lastPostedDate === weekKey) return; // already ran this week

    // Capture top drivers BEFORE reset for the announcement
    let topDrivers = [];
    try {
        const top = await getLeaderboard('solo', 3, true);
        topDrivers = top.map((p) => ({
            displayName: p.displayName || p.discordId,
            weeklyPoints: p.weeklyPoints || 0,
        }));
    } catch { /* non-fatal */ }

    await resetWeeklyPoints();
    console.log(`[weekly-reset] Weekly boards reset for ${weekKey}`);

    await dispatchWeeklyReset({ topDrivers }).catch(() => null);

    if (!state) {
        await DailyDigestState.create({
            digestKey: WEEKLY_RESET_STATE_KEY,
            lastPostedDate: weekKey,
            lastPostedAt: new Date(),
        });
    } else {
        state.lastPostedDate = weekKey;
        state.lastPostedAt   = new Date();
        await state.save();
    }
}

function startScheduler(client) {
    if (timer) return;
    timer = setInterval(() => {
        processReminders(client).catch(() => null);
        processScheduledReleases(client).catch(() => null);
        processDailyDigest(client).catch(() => null);
        processWeeklyReset().catch(() => null);
    }, 60000);
    console.log('✅ Event + release + daily digest + weekly reset scheduler started (60s tick)');
}

function stopScheduler() {
    if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { startScheduler, stopScheduler };
