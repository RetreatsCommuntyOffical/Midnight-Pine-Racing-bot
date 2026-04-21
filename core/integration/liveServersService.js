'use strict';

const { EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const RemoteEmbedState = require('../../models/RemoteEmbedState');

const EMBED_KEY   = 'live-servers-status';
const EMBED_TITLE = '🏎️  MIDNIGHT PINE RACING — LIVE SERVERS';
const DIVIDER     = '━━━━━━━━━━━━━━━━━━━━━━';

const SESSION_NAMES = {
    0: 'Booking',
    1: 'Practice',
    2: 'Qualifying',
    3: 'Race',
};

// Each URL should point to the root of the AC server HTTP API,
// e.g. http://1.2.3.4:8081  — the /INFO path is appended automatically.
// Set these in .env as AC_SERVER_MAIN_URL, AC_SERVER_TRAFFIC_URL, etc.
const SERVERS = [
    { key: 'main',     label: 'Midnight Pine Racing',                  url: process.env.AC_SERVER_MAIN_URL     },
    { key: 'traffic',  label: 'Midnight Pine Racing | Traffic',        url: process.env.AC_SERVER_TRAFFIC_URL  },
    { key: 'drift',    label: 'Midnight Pine Racing | Drift',          url: process.env.AC_SERVER_DRIFT_URL    },
    { key: 'race',     label: 'Midnight Pine Racing | Race',           url: process.env.AC_SERVER_RACE_URL     },
    { key: 'nord',     label: 'Midnight Pine Racing | Nordschleife',   url: process.env.AC_SERVER_NORD_URL     },
];

// In-memory fallback when DB is unavailable
const memState = { channelId: null, messageId: null };

// ── AC server polling ─────────────────────────────────────────────────────────

async function fetchServerInfo(baseUrl) {
    if (!baseUrl) return null;

    const infoUrl = baseUrl.replace(/\/$/, '') + '/INFO';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {
        const res = await fetch(infoUrl, { signal: controller.signal });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatTrackName(raw) {
    if (!raw) return 'Unknown';
    return raw
        .replace(/_/g, ' ')
        .replace(/-/g, '-')
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

function formatPlayers(clients, maxclients) {
    if (!clients) return `0 / ${maxclients} — Empty`;
    if (clients >= maxclients) return `${clients} / ${maxclients} — Full`;
    return `${clients} / ${maxclients} — ${clients} Active`;
}

// ── Build embed description ───────────────────────────────────────────────────

async function buildDescription() {
    const lines = [];

    for (const server of SERVERS) {
        const info        = await fetchServerInfo(server.url);
        const online      = info !== null;
        const statusIcon  = online ? '🟢' : '🔴';
        const session     = online ? (SESSION_NAMES[info.sessiontype] ?? 'Practice') : 'Offline';
        const track       = online ? formatTrackName(info.track) : '—';
        const playerLine  = online ? formatPlayers(info.clients, info.maxclients) : '— / —';

        lines.push(DIVIDER);
        lines.push(`${statusIcon} ${server.label}`);
        lines.push(`📍 Track: ${track}`);
        lines.push(`🎮 Session: ${session}`);
        lines.push(`👥 Players: ${playerLine}`);
    }

    lines.push(DIVIDER);
    return lines.join('\n');
}

// ── Persistent state ──────────────────────────────────────────────────────────

async function getState() {
    if (mongoose.connection.readyState !== 1) return { ...memState };
    const doc = await RemoteEmbedState.findOne({ embedKey: EMBED_KEY });
    if (doc) return { channelId: doc.channelId, messageId: doc.messageId };
    return { ...memState };
}

async function saveState(channelId, messageId) {
    memState.channelId = channelId;
    memState.messageId = messageId;
    if (mongoose.connection.readyState !== 1) return;
    await RemoteEmbedState.findOneAndUpdate(
        { embedKey: EMBED_KEY },
        { $set: { channelId, messageId, payloadHash: '', source: 'live-servers', lastSyncedAt: new Date() } },
        { upsert: true, new: true }
    );
}

// ── Core update function ──────────────────────────────────────────────────────

async function updateLiveServersEmbed(client) {
    const channelId = process.env.LIVE_SERVERS_CHANNEL_ID;
    if (!channelId) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const description = await buildDescription();
    const intervalSec = Math.max(30, Number(process.env.LIVE_SERVERS_POLL_INTERVAL_SEC || 60));

    const embed = new EmbedBuilder()
        .setTitle(EMBED_TITLE)
        .setDescription(description)
        .setColor(0x2f3136)
        .setFooter({ text: `Midnight Pine Racing  •  Updates every ${intervalSec}s` })
        .setTimestamp();

    const state = await getState();
    let message = null;

    if (state?.messageId) {
        message = await channel.messages.fetch(state.messageId).catch(() => null);
    }

    if (message) {
        await message.edit({ embeds: [embed] });
    } else {
        const sent = await channel.send({ embeds: [embed] });
        await saveState(channelId, sent.id);
    }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

let _timer = null;

function startLiveServersScheduler(client) {
    const enabled = String(process.env.LIVE_SERVERS_ENABLED ?? 'true').toLowerCase() === 'true';
    if (!enabled || !process.env.LIVE_SERVERS_CHANNEL_ID) return null;

    const intervalMs = Math.max(30, Number(process.env.LIVE_SERVERS_POLL_INTERVAL_SEC || 60)) * 1000;

    // Initial post on startup
    updateLiveServersEmbed(client).catch(() => null);

    _timer = setInterval(() => {
        updateLiveServersEmbed(client).catch(() => null);
    }, intervalMs);

    return _timer;
}

module.exports = { startLiveServersScheduler, updateLiveServersEmbed };
