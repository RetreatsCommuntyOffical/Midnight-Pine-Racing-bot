const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const RemoteEmbedState = require('../../models/RemoteEmbedState');

const memoryState = new Map();

const syncStatus = {
    enabled: false,
    running: false,
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: null,
    lastStats: { total: 0, updated: 0, created: 0, skipped: 0, missingChannels: 0 },
};

function hashPayload(payload) {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function buildEmbedFromPayload(payload) {
    const color = Number(payload.color || 0x2f3136);
    const embed = new EmbedBuilder().setColor(color);

    if (payload.title) embed.setTitle(String(payload.title));
    if (payload.description) embed.setDescription(String(payload.description));
    if (Array.isArray(payload.fields) && payload.fields.length) {
        embed.addFields(
            payload.fields.map((f) => ({
                name: String(f.name || 'Field'),
                value: String(f.value || '-'),
                inline: !!f.inline,
            }))
        );
    }
    if (payload.footerText) embed.setFooter({ text: String(payload.footerText) });
    if (payload.imageUrl) embed.setImage(String(payload.imageUrl));
    if (payload.thumbnailUrl) embed.setThumbnail(String(payload.thumbnailUrl));
    if (payload.timestamp !== false) embed.setTimestamp();

    return embed;
}

function mapButtonStyle(style) {
    const normalized = String(style || '').toLowerCase();
    if (normalized === 'primary') return ButtonStyle.Primary;
    if (normalized === 'secondary') return ButtonStyle.Secondary;
    if (normalized === 'success') return ButtonStyle.Success;
    if (normalized === 'danger') return ButtonStyle.Danger;
    if (normalized === 'link') return ButtonStyle.Link;
    return ButtonStyle.Secondary;
}

function buildComponentsFromPayload(payload) {
    if (!Array.isArray(payload.buttons) || payload.buttons.length === 0) return [];

    const grouped = new Map();

    for (const btn of payload.buttons.slice(0, 25)) {
        if (!btn || !btn.label) continue;
        const rowIndex = Math.max(0, Math.min(4, Number(btn.row || 0)));
        if (!grouped.has(rowIndex)) grouped.set(rowIndex, []);
        grouped.get(rowIndex).push(btn);
    }

    const rows = [];
    const sortedRows = [...grouped.keys()].sort((a, b) => a - b);

    for (const rowIndex of sortedRows) {
        const row = new ActionRowBuilder();
        const buttons = grouped.get(rowIndex).slice(0, 5);

        for (const btn of buttons) {
            const style = mapButtonStyle(btn.style);
            const builder = new ButtonBuilder().setLabel(String(btn.label)).setStyle(style);

            if (btn.emoji) builder.setEmoji(String(btn.emoji));
            if (typeof btn.disabled === 'boolean') builder.setDisabled(btn.disabled);

            if (style === ButtonStyle.Link) {
                if (!btn.url) continue;
                builder.setURL(String(btn.url));
            } else {
                if (!btn.customId) continue;
                builder.setCustomId(String(btn.customId));
            }

            row.addComponents(builder);
        }

        if (row.components.length > 0) rows.push(row);
    }

    return rows;
}

async function fetchPayloads() {
    const source = String(process.env.EMBED_SYNC_SOURCE || 'local').toLowerCase();

    if (source === 'local') {
        const filePath = process.env.EMBED_SYNC_FILE
            || path.join(__dirname, '..', '..', 'deploy', 'linux-embed-sync', 'embeds.json');

        if (!fs.existsSync(filePath)) {
            throw new Error(`Local embed sync file not found: ${filePath}`);
        }

        const raw = fs.readFileSync(filePath, 'utf8');
        const body = JSON.parse(raw);
        if (!body || !Array.isArray(body.embeds)) {
            throw new Error('Local embed sync payload invalid: expected { embeds: [] }');
        }
        return body.embeds;
    }

    const url = process.env.LINUX_SYNC_URL;
    const token = process.env.LINUX_SYNC_TOKEN || '';
    const timeoutMs = Number(process.env.LINUX_SYNC_TIMEOUT_MS || process.env.EMBED_SYNC_TIMEOUT_MS || 10000);

    if (!url) throw new Error('LINUX_SYNC_URL missing for remote embed sync source');

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Remote embed sync request failed (${res.status})`);
        const body = await res.json();
        if (!body || !Array.isArray(body.embeds)) {
            throw new Error('Remote embed sync payload invalid: expected { embeds: [] }');
        }
        return body.embeds;
    } finally {
        clearTimeout(t);
    }
}

async function getState(embedKey) {
    if (mongoose.connection.readyState !== 1) return memoryState.get(embedKey) || null;
    return RemoteEmbedState.findOne({ embedKey });
}

async function saveState(embedKey, data) {
    if (mongoose.connection.readyState !== 1) {
        memoryState.set(embedKey, { ...data, embedKey });
        return;
    }
    await RemoteEmbedState.findOneAndUpdate(
        { embedKey },
        {
            $set: {
                channelId: data.channelId,
                messageId: data.messageId,
                payloadHash: data.payloadHash,
                source: 'linux',
                lastSyncedAt: new Date(),
            },
        },
        { upsert: true, new: true }
    );
}

function resolveGuild(client) {
    return client.guilds.cache.get(process.env.HOME_GUILD_ID) || client.guilds.cache.first() || null;
}

async function resolveChannel(guild, item) {
    if (!guild) return null;
    if (item.channelId) return guild.channels.cache.get(String(item.channelId)) || null;
    if (item.channelName) return guild.channels.cache.find((c) => c.isTextBased() && c.name === String(item.channelName)) || null;
    return null;
}

async function upsertRemoteEmbed(client, guild, item, stats) {
    const key = String(item.key || '').trim();
    if (!key) return;

    const channel = await resolveChannel(guild, item);
    if (!channel || !channel.isTextBased()) {
        stats.missingChannels += 1;
        return;
    }

    const payloadHash = hashPayload(item);
    const state = await getState(key);
    if (state && state.payloadHash === payloadHash) {
        stats.skipped += 1;
        return;
    }

    const embed = buildEmbedFromPayload(item);
    const components = buildComponentsFromPayload(item);
    let targetMessage = null;

    if (state?.messageId) {
        targetMessage = await channel.messages.fetch(String(state.messageId)).catch(() => null);
    }

    if (targetMessage) {
        await targetMessage.edit({ embeds: [embed], components });
        stats.updated += 1;
        await saveState(key, {
            channelId: channel.id,
            messageId: targetMessage.id,
            payloadHash,
        });
        return;
    }

    const sent = await channel.send({ embeds: [embed], components });
    stats.created += 1;
    await saveState(key, {
        channelId: channel.id,
        messageId: sent.id,
        payloadHash,
    });
}

async function runLinuxEmbedSync(client, reason = 'manual') {
    if (syncStatus.running) return { ok: false, reason: 'already_running' };
    syncStatus.running = true;
    syncStatus.lastRunAt = new Date();
    syncStatus.lastError = null;

    const stats = { total: 0, updated: 0, created: 0, skipped: 0, missingChannels: 0, reason };

    try {
        const guild = resolveGuild(client);
        if (!guild) throw new Error('No guild available for Linux embed sync');
        const items = await fetchPayloads();
        stats.total = items.length;

        for (const item of items) {
            await upsertRemoteEmbed(client, guild, item, stats);
            await new Promise((r) => setTimeout(r, 1200));
        }

        syncStatus.lastSuccessAt = new Date();
        syncStatus.lastStats = stats;
        return { ok: true, stats };
    } catch (err) {
        syncStatus.lastError = err.message;
        syncStatus.lastStats = stats;
        return { ok: false, error: err.message, stats };
    } finally {
        syncStatus.running = false;
    }
}

function startLinuxEmbedSyncScheduler(client) {
    const enabledRaw = process.env.EMBED_SYNC_ENABLED ?? process.env.LINUX_SYNC_ENABLED ?? 'true';
    const enabled = String(enabledRaw).toLowerCase() === 'true';
    syncStatus.enabled = enabled;
    if (!enabled) return null;

    const intervalSec = Math.max(30, Number(process.env.EMBED_SYNC_INTERVAL_SEC || process.env.LINUX_SYNC_INTERVAL_SEC || 180));
    const timer = setInterval(() => {
        runLinuxEmbedSync(client, 'scheduler').catch(() => null);
    }, intervalSec * 1000);

    runLinuxEmbedSync(client, 'startup').catch(() => null);
    return timer;
}

function getLinuxSyncStatus() {
    return { ...syncStatus };
}

module.exports = {
    runLinuxEmbedSync,
    startLinuxEmbedSyncScheduler,
    getLinuxSyncStatus,
};
