'use strict';

/**
 * core/notifications/dispatcher.js
 * MIDNIGHT PINE RACING — Unified notification rules engine
 *
 * Dispatches structured embeds for:
 *  - Level-up announcements
 *  - Personal best (new high score)
 *  - Big score threshold (single-run spike worthy of a shoutout)
 *  - Weekly leaderboard reset announcements
 *
 * Usage:
 *  1) Call setDiscordClient(client) once from bot.js after clientReady.
 *  2) Call any dispatch* function from service layers — they are fire-and-forget safe.
 */

const { EmbedBuilder } = require('discord.js');

// ── Config ─────────────────────────────────────────────────────────────────────

/** Minimum single-run points that trigger a big-score shoutout */
const BIG_SCORE_THRESHOLD = Number(process.env.BIG_SCORE_THRESHOLD || 2500);

/** Channel to post level-up and milestone notices (falls back to general) */
function notifChannelId() {
    return (
        process.env.NOTIFICATIONS_CHANNEL_ID ||
        process.env.GENERAL_CHANNEL_ID        ||
        process.env.BOT_COMMANDS_CHANNEL_ID   ||
        null
    );
}

const COLORS = {
    levelUp:   0x9b59b6,
    pb:        0xfdcb6e,
    bigScore:  0xe17055,
    reset:     0x0a3d62,
};

const FOOTER = 'MIDNIGHT PINE RACING';
const DIVIDER = '━━━━━━━━━━━━━━━━━━';

// ── Discord client reference ───────────────────────────────────────────────────

let _client = null;

function setDiscordClient(client) {
    _client = client;
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function baseEmbed(color, title, description) {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: FOOTER })
        .setTimestamp();
}

async function postToChannel(channelId, payload) {
    if (!_client?.isReady() || !channelId) return;
    try {
        const ch = await _client.channels.fetch(channelId).catch(() => null);
        if (!ch?.isTextBased()) return;
        await ch.send(payload);
    } catch {
        // Non-fatal — notification best-effort
    }
}

// ── Level-up ──────────────────────────────────────────────────────────────────

const LEVEL_TITLES = {
    5:  '🌱 Rising Rookie',
    10: '🔥 Street Burner',
    15: '⚡ Circuit Threat',
    20: '🏆 Elite Driver',
    25: '🌑 Midnight Ace',
    30: '👑 Pine Legend',
};

function levelTitle(level) {
    const keys = Object.keys(LEVEL_TITLES)
        .map(Number)
        .filter((k) => level >= k)
        .sort((a, b) => b - a);
    return keys.length ? LEVEL_TITLES[keys[0]] : null;
}

/**
 * Dispatch a level-up announcement.
 * @param {object} opts
 * @param {string} opts.discordId
 * @param {string} opts.displayName
 * @param {number} opts.oldLevel
 * @param {number} opts.newLevel
 */
async function dispatchLevelUp({ discordId, displayName, oldLevel, newLevel }) {
    const channelId = notifChannelId();
    if (!channelId) return;

    const milestone = levelTitle(newLevel);
    const lines = [
        DIVIDER,
        `<@${discordId}> leveled up!`,
        `**${oldLevel}** → **${newLevel}**`,
    ];
    if (milestone) lines.push(`\n✨ Milestone unlocked: **${milestone}**`);

    const embed = baseEmbed(COLORS.levelUp, '⬆️ Level Up!', lines.join('\n'));
    if (milestone) embed.addFields({ name: '🏅 Title', value: milestone, inline: true });
    embed.addFields({ name: '👤 Driver', value: displayName || `<@${discordId}>`, inline: true });

    await postToChannel(channelId, { embeds: [embed] });
}

// ── Personal best ─────────────────────────────────────────────────────────────

const METRIC_LABELS = {
    top_speed:        { label: '🚀 Top Speed',          unit: 'mph'   },
    distance:         { label: '📏 Best Distance',       unit: 'm'     },
    drift_points_run: { label: '🌀 Single Run Points',   unit: 'pts'   },
};

/**
 * Dispatch a personal best announcement.
 * @param {object} opts
 * @param {string} opts.discordId
 * @param {string} opts.displayName
 * @param {'top_speed'|'distance'|'drift_points_run'} opts.metric
 * @param {number} opts.value
 */
async function dispatchPersonalBest({ discordId, displayName, metric, value }) {
    const channelId = notifChannelId();
    if (!channelId) return;

    const meta = METRIC_LABELS[metric] || { label: metric, unit: '' };
    const embed = baseEmbed(
        COLORS.pb,
        '⭐ Personal Best!',
        `${DIVIDER}\n<@${discordId}> just set a new personal best!`,
    );
    embed.addFields(
        { name: '👤 Driver', value: displayName || `<@${discordId}>`, inline: true },
        { name: meta.label, value: `**${Number(value).toLocaleString()}** ${meta.unit}`.trim(), inline: true },
    );

    await postToChannel(channelId, { embeds: [embed] });
}

// ── Big score shoutout ────────────────────────────────────────────────────────

/**
 * Dispatch a big single-run score shoutout when points >= BIG_SCORE_THRESHOLD.
 * @param {object} opts
 * @param {string} opts.discordId
 * @param {string} opts.displayName
 * @param {number} opts.points
 */
async function dispatchBigScore({ discordId, displayName, points }) {
    if (Number(points || 0) < BIG_SCORE_THRESHOLD) return;
    const channelId = notifChannelId();
    if (!channelId) return;

    const embed = baseEmbed(
        COLORS.bigScore,
        '🔥 Massive Run!',
        `${DIVIDER}\n<@${discordId}> just dropped a monster score!`,
    );
    embed.addFields(
        { name: '👤 Driver', value: displayName || `<@${discordId}>`, inline: true },
        { name: '🌀 Points', value: `**${Number(points).toLocaleString()}** pts`, inline: true },
    );

    await postToChannel(channelId, { embeds: [embed] });
}

// ── Weekly reset announcement ─────────────────────────────────────────────────

/**
 * Dispatch a weekly leaderboard reset announcement.
 * @param {object} opts
 * @param {{ displayName: string, weeklyPoints: number }[]} [opts.topDrivers]  – up to 3
 */
async function dispatchWeeklyReset({ topDrivers = [] } = {}) {
    const channelId =
        process.env.ANNOUNCEMENTS_CHANNEL_ID ||
        notifChannelId();
    if (!channelId) return;

    const podium = topDrivers
        .slice(0, 3)
        .map((d, i) => {
            const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
            return `${medal} **${d.displayName}** — ${Number(d.weeklyPoints || 0).toLocaleString()} pts`;
        })
        .join('\n');

    const description = [
        DIVIDER,
        '🔄 The weekly leaderboards have been **reset**.',
        'A new week starts now — get back out there and earn your spot.',
        '',
        podium ? `**Last week's top performers:**\n${podium}` : '',
        DIVIDER,
    ]
        .filter((l) => l !== '')
        .join('\n');

    const embed = baseEmbed(COLORS.reset, '🏁 Weekly Reset', description);

    await postToChannel(channelId, { embeds: [embed] });
}

module.exports = {
    setDiscordClient,
    dispatchLevelUp,
    dispatchPersonalBest,
    dispatchBigScore,
    dispatchWeeklyReset,
    BIG_SCORE_THRESHOLD,
};
