/**
 * core/messageBroker.js
 *
 * Central send guard for all bot-initiated channel messages.
 *
 * Rules enforced:
 *  - 1 embed per message maximum (never embeds:[e1,e2,...])
 *  - 2.5 s cooldown between messages in the same channel
 *  - 600 ms merge window: embeds queued within the window are combined into
 *    a single message with all information in one embed
 *  - Dedup: identical payload (by hash) is suppressed within a 30 s TTL
 *  - Whitelist: specific channel IDs (EMBED_WHITELIST_CHANNELS env) bypass
 *    merge and can receive individual sends (useful for log/dev channels)
 */

'use strict';

const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');

// ── Config ────────────────────────────────────────────────────────────────────

const COOLDOWN_MS     = 2500;    // minimum gap between sends in the same channel
const MERGE_WINDOW_MS = 600;     // wait this long to batch concurrent queues
const DEDUP_TTL_MS    = 30_000;  // suppress identical payloads within this window

/** Channel IDs that bypass merge (logs, dev channels). Comma-separated env var. */
const WHITELIST_CHANNELS = new Set(
    (process.env.EMBED_WHITELIST_CHANNELS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
);

// ── Internal state ────────────────────────────────────────────────────────────

/**
 * Per-channel state.
 * @type {Map<string, { queue: Array, timer: NodeJS.Timeout|null, lastSentAt: number, recentHashes: Map<string,number> }>}
 */
const _channels = new Map();

function _getState(channelId) {
    if (!_channels.has(channelId)) {
        _channels.set(channelId, {
            queue:        [],
            timer:        null,
            lastSentAt:   0,
            recentHashes: new Map(),
        });
    }
    return _channels.get(channelId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _hashPayload(payload) {
    const e = payload.embeds?.[0];
    const src = e ? (e.data ?? e) : payload;
    return crypto.createHash('sha1').update(JSON.stringify(src)).digest('hex');
}

function _purgeStaleDedups(state) {
    const now = Date.now();
    for (const [hash, ts] of state.recentHashes) {
        if (now - ts > DEDUP_TTL_MS) state.recentHashes.delete(hash);
    }
}

/**
 * Merge multiple payloads into one message with a single embed.
 * Primary embed is used as base; additional embeds are appended as fields.
 */
function _mergeIntoOne(payloads) {
    if (payloads.length === 1) return payloads[0];

    const base      = payloads[0];
    const baseEmbed = base.embeds?.[0];
    if (!baseEmbed) return base;

    const merged      = EmbedBuilder.from(baseEmbed);
    let   fieldBudget = 25 - (merged.data?.fields?.length ?? 0);

    for (let i = 1; i < payloads.length && fieldBudget > 0; i++) {
        const raw  = payloads[i].embeds?.[0];
        if (!raw) continue;
        const data = raw.data ?? raw;

        // Section header using secondary embed's title
        if (data.title && fieldBudget > 0) {
            merged.addFields({ name: '─', value: `**${data.title}**`, inline: false });
            fieldBudget--;
        }

        if (data.description && fieldBudget > 0) {
            merged.addFields({ name: '\u200b', value: data.description.slice(0, 1024), inline: false });
            fieldBudget--;
        }

        if (data.fields) {
            const take = Math.min(data.fields.length, fieldBudget);
            if (take > 0) merged.addFields(...data.fields.slice(0, take));
            fieldBudget -= take;
        }
    }

    // Preserve components from the first payload only
    return { embeds: [merged], components: base.components ?? [] };
}

// ── Core flush ────────────────────────────────────────────────────────────────

async function _flush(channel) {
    const state = _getState(channel.id);
    state.timer = null;

    if (!state.queue.length) return;

    const items = state.queue.splice(0);

    // Remove duplicates
    _purgeStaleDedups(state);
    const unique = items.filter((item) => !state.recentHashes.has(item.hash));
    if (!unique.length) return;

    // Enforce cooldown
    const gap = Date.now() - state.lastSentAt;
    if (gap < COOLDOWN_MS) {
        await new Promise((r) => setTimeout(r, COOLDOWN_MS - gap));
    }

    if (WHITELIST_CHANNELS.has(channel.id)) {
        // Whitelisted channel: send individually, cooldown between each
        for (let i = 0; i < unique.length; i++) {
            await channel.send(unique[i].payload).catch(() => null);
            state.lastSentAt = Date.now();
            state.recentHashes.set(unique[i].hash, state.lastSentAt);
            if (i < unique.length - 1) {
                await new Promise((r) => setTimeout(r, COOLDOWN_MS));
            }
        }
    } else {
        // Default: merge all queued updates into one message
        const merged = _mergeIntoOne(unique.map((u) => u.payload));
        await channel.send(merged).catch(() => null);
        state.lastSentAt = Date.now();
        for (const item of unique) {
            state.recentHashes.set(item.hash, state.lastSentAt);
        }
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Queue a message for delivery to a channel.
 * Respects cooldown, merge window, and dedup.
 * Use for background/fire-and-forget sends (leaderboard updates, etc.).
 *
 * @param {import('discord.js').TextBasedChannel} channel
 * @param {{ embeds?: any[], components?: any[], content?: string }} payload
 */
function queue(channel, payload) {
    const state = _getState(channel.id);
    const hash  = _hashPayload(payload);
    state.queue.push({ payload, hash });
    if (!state.timer) {
        state.timer = setTimeout(() => _flush(channel), MERGE_WINDOW_MS);
    }
}

/**
 * Send immediately to a channel, respecting cooldown only (no merge window).
 * Use for direct non-interaction channel sends where timing matters.
 *
 * @param {import('discord.js').TextBasedChannel} channel
 * @param {{ embeds?: any[], components?: any[], content?: string }} payload
 * @returns {Promise<import('discord.js').Message|null>}
 */
async function send(channel, payload) {
    const state = _getState(channel.id);
    const gap   = Date.now() - state.lastSentAt;
    if (gap < COOLDOWN_MS) {
        await new Promise((r) => setTimeout(r, COOLDOWN_MS - gap));
    }
    const msg = await channel.send(payload).catch(() => null);
    state.lastSentAt = Date.now();
    return msg;
}

module.exports = { queue, send, WHITELIST_CHANNELS };
