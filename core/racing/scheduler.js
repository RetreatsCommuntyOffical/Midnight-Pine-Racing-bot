const RaceEventSchedule = require('../../models/RaceEventSchedule');
const { processScheduledReleases } = require('./releaseService');

let timer = null;

const REMINDER_WINDOWS = [60, 15, 5]; // minutes before event

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

                const ping = evt.targetRoleId ? `<@&${evt.targetRoleId}>` : '';
                const label = minsUntil <= 1 ? 'is starting **NOW**' : `starts in **${minsUntil} minutes**`;

                if (channel) {
                    await channel.send(`🏁 ${ping} **${evt.title}** ${label}!`).catch(() => null);
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

function startScheduler(client) {
    if (timer) return;
    timer = setInterval(() => {
        processReminders(client).catch(() => null);
        processScheduledReleases(client).catch(() => null);
    }, 60000);
    console.log('✅ Event + release scheduler started (60s tick)');
}

function stopScheduler() {
    if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { startScheduler, stopScheduler };
