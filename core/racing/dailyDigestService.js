'use strict';

const RaceEventSchedule = require('../../models/RaceEventSchedule');
const DailyDigestState = require('../../models/DailyDigestState');
const { eventEmbed, ts } = require('../ui/theme');

const DAILY_QUOTES = [
    'Legends are built one clean run at a time.',
    'Throttle control wins races before top speed does.',
    'Consistency is faster than chaos over a full season.',
    'Your line through the corner writes your name on the board.',
    'Pressure creates champions. Precision keeps them there.',
    'Drive smart first, then drive fast.',
    'Every restart is a new chance to set a personal best.',
    'Stay smooth. Stay focused. Stay dangerous.',
    'A clean lap today is a podium tomorrow.',
    'Racecraft is respect at speed.',
    'Small gains every day become big gaps on race day.',
    'You do not chase luck. You build pace.',
    'The board only remembers results. Earn yours.',
    'Discipline is the fastest upgrade in the garage.',
    'Fast hands matter. Calm decisions matter more.',
];

const QUOTE_STATE_KEY = 'daily-quote';
const EVENTS_STATE_KEY = 'daily-events';
const DEFAULT_RETRY_LOCK_MINUTES = 10;

function parseBoolean(value, defaultValue = true) {
    if (value === undefined || value === null || value === '') return defaultValue;
    const normalized = String(value).trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function parseNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function normalizeTimeZone(rawTimeZone) {
    const candidate = String(rawTimeZone || 'UTC').trim() || 'UTC';
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
        return candidate;
    } catch {
        return 'UTC';
    }
}

function getGuild(client) {
    const homeGuildId = String(process.env.HOME_GUILD_ID || '').trim();
    return (homeGuildId && client.guilds.cache.get(homeGuildId)) || client.guilds.cache.first() || null;
}

function getDatePartsInTimeZone(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        weekday: 'long',
    });
    const parts = formatter.formatToParts(date);
    const map = {};
    for (const part of parts) {
        if (part.type !== 'literal') map[part.type] = part.value;
    }

    return {
        year: Number(map.year),
        month: Number(map.month),
        day: Number(map.day),
        hour: Number(map.hour),
        minute: Number(map.minute),
        weekday: map.weekday,
        key: `${map.year}-${map.month}-${map.day}`,
    };
}

function isAfterDailyPostTime(nowParts, hour, minute) {
    if (nowParts.hour > hour) return true;
    if (nowParts.hour < hour) return false;
    return nowParts.minute >= minute;
}

function quoteForDateKey(dateKey) {
    let hash = 0;
    for (let i = 0; i < dateKey.length; i += 1) {
        hash = ((hash << 5) - hash + dateKey.charCodeAt(i)) | 0;
    }
    const index = Math.abs(hash) % DAILY_QUOTES.length;
    return DAILY_QUOTES[index];
}

function buildQuoteMessage(dateParts, timeZone) {
    const quote = quoteForDateKey(dateParts.key);
    return [
        `**Daily Quote · ${dateParts.weekday}**`,
        `"${quote}"`,
        '',
        `Timezone: ${timeZone}`,
    ].join('\n');
}

async function acquireDailySlot(digestKey, dateKey, lockMinutes) {
    const now = new Date();

    await DailyDigestState.updateOne(
        { digestKey },
        { $setOnInsert: { digestKey, lastPostedDate: null, lastPostedAt: null, lockDate: null, lockExpiresAt: null, lastRunAt: null, lastError: null } },
        { upsert: true }
    );

    const lockExpiresAt = new Date(now.getTime() + (Math.max(1, lockMinutes) * 60 * 1000));

    const claimed = await DailyDigestState.findOneAndUpdate(
        {
            digestKey,
            lastPostedDate: { $ne: dateKey },
            $or: [
                { lockDate: null },
                { lockDate: { $ne: dateKey } },
                { lockExpiresAt: { $lte: now } },
            ],
        },
        {
            $set: {
                lockDate: dateKey,
                lockExpiresAt,
                lastRunAt: now,
                lastError: null,
            },
        },
        { new: true }
    );

    return !!claimed;
}

async function markDailySlotPosted(digestKey, dateKey) {
    await DailyDigestState.updateOne(
        { digestKey, lockDate: dateKey },
        {
            $set: {
                lastPostedDate: dateKey,
                lastPostedAt: new Date(),
                lockDate: null,
                lockExpiresAt: null,
                lastRunAt: new Date(),
                lastError: null,
            },
        }
    );
}

async function markDailySlotError(digestKey, dateKey, message) {
    await DailyDigestState.updateOne(
        { digestKey },
        {
            $set: {
                lastError: String(message || 'unknown_error'),
                lastRunAt: new Date(),
            },
            $setOnInsert: {
                lockDate: dateKey,
            },
        },
        { upsert: true }
    );
}

async function clearDailyLock(digestKey, dateKey) {
    await DailyDigestState.updateOne(
        { digestKey, lockDate: dateKey },
        {
            $set: {
                lockDate: null,
                lockExpiresAt: null,
                lastRunAt: new Date(),
            },
        }
    );
}

function resolveQuoteChannel(guild) {
    const candidates = [
        process.env.DAILY_QUOTE_CHANNEL_ID,
        process.env.ANNOUNCEMENTS_CHANNEL_ID,
        process.env.EVENT_ALERTS_CHANNEL_ID,
        process.env.EVENTS_CHANNEL_ID,
    ].filter(Boolean);

    for (const id of candidates) {
        const channel = guild.channels.cache.get(String(id).trim());
        if (channel?.isTextBased?.()) return channel;
    }

    return guild.channels.cache.find(
        (c) => c?.isTextBased?.() && /announce|news|updates|general/i.test(c.name || '')
    ) || null;
}

function resolveEventsChannel(guild) {
    const candidates = [
        process.env.DAILY_EVENTS_CHANNEL_ID,
        process.env.EVENTS_CHANNEL_ID,
        process.env.EVENT_ALERTS_CHANNEL_ID,
        process.env.REMINDERS_CHANNEL_ID,
    ].filter(Boolean);

    for (const id of candidates) {
        const channel = guild.channels.cache.get(String(id).trim());
        if (channel?.isTextBased?.()) return channel;
    }

    return guild.channels.cache.find(
        (c) => c?.isTextBased?.() && /event|calendar|schedule/i.test(c.name || '')
    ) || null;
}

async function postDailyQuote(client, dateParts, timeZone, lockMinutes, options = {}) {
    const guild = getGuild(client);
    if (!guild) return;

    const force = !!options.force;
    const overrideChannel = options.overrideChannel || null;

    if (!force) {
        const shouldPost = await acquireDailySlot(QUOTE_STATE_KEY, dateParts.key, lockMinutes);
        if (!shouldPost) return false;
    }

    try {
        const channel = overrideChannel || resolveQuoteChannel(guild);
        if (!channel) throw new Error('Daily quote channel not found. Set DAILY_QUOTE_CHANNEL_ID or announcement channel IDs.');

        const message = buildQuoteMessage(dateParts, timeZone);

        await channel.send({ content: message });
        if (!overrideChannel) await markDailySlotPosted(QUOTE_STATE_KEY, dateParts.key);
        return true;
    } catch (err) {
        if (!force && !overrideChannel) {
            await markDailySlotError(QUOTE_STATE_KEY, dateParts.key, err?.message || err);
        } else if (!overrideChannel) {
            await clearDailyLock(QUOTE_STATE_KEY, dateParts.key);
        }
        throw err;
    }
}

function buildTodaysEventsEmbed(events, dateParts, timeZone) {
    if (!events.length) {
        return eventEmbed({
            title: `🗓️ Today's Race Events · ${dateParts.weekday}`,
            description: `No race events are scheduled for today in ${timeZone}.`,
            footer: 'Daily Events Summary',
        });
    }

    const fields = events.slice(0, 20).map((evt, index) => ({
        name: `${index + 1}. ${evt.title}`,
        value: [
            `Starts ${ts(evt.startsAt, 't')} (${ts(evt.startsAt, 'R')})`,
            evt.description ? `Details: ${evt.description}` : 'Details: Race briefing in this channel before start.',
        ].join('\n'),
        inline: false,
    }));

    return eventEmbed({
        title: `🗓️ Today's Race Events · ${dateParts.weekday}`,
        description: `Here is what is happening today in words and schedule form (${timeZone}).`,
        fields,
        footer: `${events.length} event${events.length === 1 ? '' : 's'} today`,
    });
}

async function postDailyEventsSummary(client, dateParts, timeZone, now, lockMinutes) {
    const guild = getGuild(client);
    if (!guild) return;

    const shouldPost = await acquireDailySlot(EVENTS_STATE_KEY, dateParts.key, lockMinutes);
    if (!shouldPost) return;

    try {
        const channel = resolveEventsChannel(guild);
        if (!channel) throw new Error('Daily events channel not found. Set DAILY_EVENTS_CHANNEL_ID or events channel IDs.');

        const lower = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        const upper = new Date(now.getTime() + (48 * 60 * 60 * 1000));

        const candidates = await RaceEventSchedule.find({
            status: { $in: ['scheduled', 'started'] },
            startsAt: { $gte: lower, $lte: upper },
        }).sort({ startsAt: 1 });

        const todaysEvents = candidates.filter((evt) => getDatePartsInTimeZone(evt.startsAt, timeZone).key === dateParts.key);
        const embed = buildTodaysEventsEmbed(todaysEvents, dateParts, timeZone);

        await channel.send({ embeds: [embed] });
        await markDailySlotPosted(EVENTS_STATE_KEY, dateParts.key);
    } catch (err) {
        await markDailySlotError(EVENTS_STATE_KEY, dateParts.key, err?.message || err);
        throw err;
    }
}

async function postDailyEventsSummaryManual(client, dateParts, timeZone, now, lockMinutes, options = {}) {
    const guild = getGuild(client);
    if (!guild) return;

    const force = !!options.force;
    const overrideChannel = options.overrideChannel || null;

    if (!force && !overrideChannel) {
        const shouldPost = await acquireDailySlot(EVENTS_STATE_KEY, dateParts.key, lockMinutes);
        if (!shouldPost) return false;
    }

    try {
        const channel = overrideChannel || resolveEventsChannel(guild);
        if (!channel) throw new Error('Daily events channel not found. Set DAILY_EVENTS_CHANNEL_ID or events channel IDs.');

        const lower = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        const upper = new Date(now.getTime() + (48 * 60 * 60 * 1000));

        const candidates = await RaceEventSchedule.find({
            status: { $in: ['scheduled', 'started'] },
            startsAt: { $gte: lower, $lte: upper },
        }).sort({ startsAt: 1 });

        const todaysEvents = candidates.filter((evt) => getDatePartsInTimeZone(evt.startsAt, timeZone).key === dateParts.key);
        const embed = buildTodaysEventsEmbed(todaysEvents, dateParts, timeZone);

        await channel.send({ embeds: [embed] });
        if (!overrideChannel) await markDailySlotPosted(EVENTS_STATE_KEY, dateParts.key);
        return true;
    } catch (err) {
        if (!force && !overrideChannel) {
            await markDailySlotError(EVENTS_STATE_KEY, dateParts.key, err?.message || err);
        } else if (!overrideChannel) {
            await clearDailyLock(EVENTS_STATE_KEY, dateParts.key);
        }
        throw err;
    }
}

async function processDailyDigest(client) {
    if (!client?.isReady?.()) return;

    const enabled = parseBoolean(process.env.DAILY_DIGEST_ENABLED, true);
    if (!enabled) return;

    const timeZone = normalizeTimeZone(process.env.DAILY_DIGEST_TIMEZONE || 'UTC');
    const postHour = Math.min(23, Math.max(0, parseNumber(process.env.DAILY_DIGEST_HOUR, 9)));
    const postMinute = Math.min(59, Math.max(0, parseNumber(process.env.DAILY_DIGEST_MINUTE, 0)));
    const retryLockMinutes = Math.min(120, Math.max(1, parseNumber(process.env.DAILY_DIGEST_RETRY_LOCK_MIN, DEFAULT_RETRY_LOCK_MINUTES)));

    const now = new Date();
    const nowParts = getDatePartsInTimeZone(now, timeZone);
    if (!isAfterDailyPostTime(nowParts, postHour, postMinute)) return;

    await postDailyQuote(client, nowParts, timeZone, retryLockMinutes);
    await postDailyEventsSummaryManual(client, nowParts, timeZone, now, retryLockMinutes);
}

async function triggerDailyDigestNow(client, options = {}) {
    if (!client?.isReady?.()) throw new Error('Client is not ready yet.');

    const force = !!options.force;
    const timeZone = normalizeTimeZone(process.env.DAILY_DIGEST_TIMEZONE || 'UTC');
    const retryLockMinutes = Math.min(120, Math.max(1, parseNumber(process.env.DAILY_DIGEST_RETRY_LOCK_MIN, DEFAULT_RETRY_LOCK_MINUTES)));
    const now = new Date();
    const dateParts = getDatePartsInTimeZone(now, timeZone);

    const quotePosted = await postDailyQuote(client, dateParts, timeZone, retryLockMinutes, { force });
    const eventsPosted = await postDailyEventsSummaryManual(client, dateParts, timeZone, now, retryLockMinutes, { force });

    return {
        dateKey: dateParts.key,
        timeZone,
        quotePosted: !!quotePosted,
        eventsPosted: !!eventsPosted,
        force,
    };
}

async function previewDailyDigest(client, options = {}) {
    if (!client?.isReady?.()) throw new Error('Client is not ready yet.');

    const guild = getGuild(client);
    if (!guild) throw new Error('Guild not found in client cache.');

    const channelId = String(options.channelId || '').trim();
    if (!channelId) throw new Error('Preview channel ID is required.');

    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isTextBased?.()) throw new Error('Preview channel is not a valid text channel.');

    const timeZone = normalizeTimeZone(options.timeZone || process.env.DAILY_DIGEST_TIMEZONE || 'UTC');
    const now = new Date();
    const dateParts = getDatePartsInTimeZone(now, timeZone);

    await postDailyQuote(client, dateParts, timeZone, DEFAULT_RETRY_LOCK_MINUTES, { force: true, overrideChannel: channel });
    await postDailyEventsSummaryManual(client, dateParts, timeZone, now, DEFAULT_RETRY_LOCK_MINUTES, { force: true, overrideChannel: channel });

    return {
        channelId,
        dateKey: dateParts.key,
        timeZone,
    };
}

module.exports = {
    processDailyDigest,
    triggerDailyDigestNow,
    previewDailyDigest,
    __test: {
        parseBoolean,
        parseNumber,
        normalizeTimeZone,
        getDatePartsInTimeZone,
        isAfterDailyPostTime,
        quoteForDateKey,
    },
};
