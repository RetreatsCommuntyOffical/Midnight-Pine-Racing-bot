const { EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { getLeaderboard } = require('./service');
const broker = require('../messageBroker');

const SOLO_BANNER_URL    = process.env.SOLO_BOARD_BANNER_URL    || process.env.LEADERBOARDS_BANNER_URL || '';
const STREET_BANNER_URL  = process.env.STREET_BOARD_BANNER_URL  || process.env.LEADERBOARDS_BANNER_URL || '';
const CIRCUIT_BANNER_URL = process.env.CIRCUIT_BOARD_BANNER_URL || process.env.LEADERBOARDS_BANNER_URL || '';
const TEAMS_BANNER_URL   = process.env.TEAMS_BANNER_URL          || process.env.LEADERBOARDS_BANNER_URL || '';

const BANNER_MAP = {
    solo:    SOLO_BANNER_URL,
    street:  STREET_BANNER_URL,
    circuit: CIRCUIT_BANNER_URL,
    teams:   TEAMS_BANNER_URL,
};

const DIVIDER = '━━━━━━━━━━━━━━━━━━';

const CHANNEL_ID_MAP = {
    solo:    process.env.SOLO_BOARD_CHANNEL_ID,
    street:  process.env.STREET_BOARD_CHANNEL_ID,
    circuit: process.env.CIRCUIT_BOARD_CHANNEL_ID,
    teams:   process.env.TEAM_BOARD_CHANNEL_ID,
};

// Fallback name-based lookup (emoji-normalized)
const CHANNEL_NAME_MAP = {
    solo:    'solo-board',
    street:  'street-board',
    circuit: 'circuit-board',
    teams:   'team-board',
};

const COLORS = {
    solo:    0xfdcb6e,
    street:  0x4a235a,
    circuit: 0x0a3d62,
    teams:   0x00b894,
};

const MEDALS = ['🥇', '🥈', '🥉'];

function pinnedMessagesToArray(pinned) {
    if (!pinned) return [];
    if (Array.isArray(pinned)) return pinned;
    if (typeof pinned.values === 'function') return [...pinned.values()];
    return [];
}

async function fetchBotEmbeds(channel, botId, maxMessages = 500) {
    const collected = [];
    let before = null;

    while (collected.length < maxMessages) {
        const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
        if (!batch || batch.size === 0) break;

        for (const msg of batch.values()) {
            if (msg.author.id === botId && msg.embeds.length > 0) {
                collected.push(msg);
            }
        }

        before = batch.last().id;
    }

    return collected.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
}

async function buildLeaderboardEmbed(type, weekly = false) {
    let rows = [];
    try {
        if (mongoose.connection.readyState !== 1) throw new Error('DB offline');
        rows = await getLeaderboard(type, 10, weekly);
    } catch {
        const offlineEmbed = new EmbedBuilder()
            .setColor(0x636e72)
            .setTitle('⚠️ Leaderboard Unavailable')
            .setDescription('Leaderboard data is temporarily unavailable — database is not connected.')
            .setTimestamp()
            .setFooter({ text: 'Midnight Pine Racing' });
        const offlineBanner = BANNER_MAP[type] || '';
        if (offlineBanner) offlineEmbed.setImage(offlineBanner);
        return offlineEmbed;
    }
    const label = weekly ? '(This Week)' : '(All Time)';
    const titles = {
        solo:    `🏆  Solo Standings ${label}`,
        street:  `🏙️  Street Standings ${label}`,
        circuit: `🏁  Circuit Standings ${label}`,
        teams:   `👥  Team Standings ${label}`,
    };

    const lines = rows.map((row, i) => {
        const medal = MEDALS[i] || `**${i + 1}.**`;
        if (type === 'teams') {
            const pts = weekly ? row.weeklyPoints : row.totalPoints;
            return `${medal} **${row.name}** — ${pts} pts | ${row.teamWins} wins`;
        }
        const pts = weekly
            ? (type === 'street' ? row.weeklyStreetPoints : type === 'circuit' ? row.weeklyCircuitPoints : row.weeklyPoints)
            : (type === 'street' ? row.streetPoints       : type === 'circuit' ? row.circuitPoints       : row.totalPoints);
        return `${medal} <@${row.discordId}> — **${pts} pts** · ${row.tier}`;
    });

    const embed = new EmbedBuilder()
        .setColor(COLORS[type] || 0xffffff)
        .setTitle(titles[type] || 'Leaderboard')
        .setDescription(lines.length ? `${DIVIDER}\n${lines.join('\n')}\n${DIVIDER}` : 'No entries yet.')
        .setTimestamp()
        .setFooter({ text: 'Midnight Pine Racing' });

    const bannerUrl = BANNER_MAP[type] || '';
    if (bannerUrl) embed.setImage(bannerUrl);

    return embed;
}

async function postLeaderboardToChannel(client, guild, type, weekly = false) {
    if (!guild) return;
    const channelId = CHANNEL_ID_MAP[type];
    const slug      = CHANNEL_NAME_MAP[type];
    const channel   = channelId
        ? guild.channels.cache.get(channelId)
        : guild.channels.cache.find((c) => c.isTextBased() && c.name.endsWith(slug));
    if (!channel) {
        console.warn(`[leaderboard] channel not found for type="${type}" (id=${channelId || 'none'}, slug=${slug})`);
        return;
    }

    const embed = await buildLeaderboardEmbed(type, weekly);

    // Keep exactly one bot-managed embed per leaderboard channel.
    // If history cannot be read, bail out instead of sending blindly.
    const botEmbeds = await fetchBotEmbeds(channel, client.user.id).catch(() => null);
    if (botEmbeds === null) return;

    let primary = botEmbeds[0] || null;
    if (primary) {
        await primary.edit({ embeds: [embed] }).catch(() => null);
    } else {
        primary = await broker.send(channel, { embeds: [embed] });
    }

    if (!primary) return;

    for (const duplicate of botEmbeds.slice(1)) {
        await duplicate.delete().catch(() => null);
    }

    const pinned = await channel.messages.fetchPins().catch(() => null);
    for (const msg of pinnedMessagesToArray(pinned)) {
        if (msg.author.id === client.user.id && msg.id !== primary.id) {
            await msg.unpin().catch(() => null);
        }
    }

    if (!primary.pinned) await primary.pin().catch(() => null);
}

async function refreshAllLeaderboards(client, guild) {
    for (const type of ['solo', 'street', 'circuit', 'teams']) {
        await postLeaderboardToChannel(client, guild, type).catch(() => null);
    }
}

module.exports = { buildLeaderboardEmbed, postLeaderboardToChannel, refreshAllLeaderboards };
