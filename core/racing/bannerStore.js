'use strict';
/**
 * BannerStore — auto-resolves fresh Discord CDN URLs for all server banners.
 *
 * Discord CDN attachment URLs contain expiry tokens (ex=...) that expire after
 * ~24 hours. Rather than storing expired URLs in .env, this module scans the
 * LOGOS_CHANNEL_ID channel on startup and on-demand, building a live cache of
 * filename→URL mappings. Falls back to .env values if the channel is offline.
 *
 * Filename → banner type mapping is driven by the filenames the owner uploaded.
 */

// ── Filename → banner type ────────────────────────────────────────────────────
// Keys are lowercase filenames (case-insensitive match). Values are banner keys.
const FILENAME_MAP = {
    'solo_board.jpg':     'solo',
    'street_board.jpg':   'street',
    'circket_board.jpg':  'circuit',   // typo in upload filename — still circuit
    'circuit_board.jpg':  'circuit',
    'image_21.jpg':       'teams',
    'image_22.jpg':       'team_hub',
    'image_23.jpg':       'leaderboards',
    'image_25.jpg':       'support_hub',
    'image_18.jpg':       'welcome',
    'welcome_banner.jpg': 'welcome',
    'welcome-banner.jpg': 'welcome',
    'role_selection.jpg': 'role_selection',
    'role-selection-banner.jpg': 'role_selection',
    'support_hub.jpg':    'support_hub',
    'support-hub-banner.jpg': 'support_hub',
    'team_hub.jpg':       'team_hub',
    'team-hub-banner.jpg':'team_hub',
    'teams_banner.jpg':   'teams',
    'team-board.jpg':     'teams',
    'leaderboards.jpg':   'leaderboards',
    'the_circle_racing_team_banner.jpg': 'circle_racing_banner',
    'the_circle_racing_team_logo.jpg':   'circle_racing_logo',
};

// PNG variants (image.png files uploaded in sequence)
// We track these by message ID order since filenames collide.
// The first image.png → role_selection, second → support_hub
const PNG_SEQUENCE_MAP = ['role_selection', 'support_hub', 'team_hub'];

// ── .env fallbacks ────────────────────────────────────────────────────────────
function envFallbacks() {
    return {
        solo:          process.env.SOLO_BOARD_BANNER_URL     || process.env.LEADERBOARDS_BANNER_URL || '',
        street:        process.env.STREET_BOARD_BANNER_URL   || process.env.LEADERBOARDS_BANNER_URL || '',
        circuit:       process.env.CIRCUIT_BOARD_BANNER_URL  || process.env.LEADERBOARDS_BANNER_URL || '',
        teams:         process.env.TEAMS_BANNER_URL          || process.env.LEADERBOARDS_BANNER_URL || '',
        leaderboards:  process.env.LEADERBOARDS_BANNER_URL   || '',
        welcome:       process.env.WELCOME_BANNER_URL        || '',
        role_selection: process.env.ROLE_SELECTION_BANNER_URL || '',
        support_hub:   process.env.SUPPORT_HUB_BANNER_URL    || '',
        team_hub:      process.env.TEAM_HUB_BANNER_URL       || '',
    };
}

// ── In-memory cache ───────────────────────────────────────────────────────────
let _cache = {};           // { [type]: url }
let _refreshedAt = null;   // Date of last successful refresh
let _discordClient = null;

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

function setDiscordClient(client) {
    _discordClient = client;
    // Seed from .env immediately so banners work before first refresh
    _cache = envFallbacks();
}

/** Get a banner URL by type. Returns '' if unknown. */
function getBanner(type) {
    return _cache[type] || envFallbacks()[type] || '';
}

/** Force-refresh from the logos channel. Returns a summary object. */
async function refreshFromChannel() {
    const channelId = process.env.LOGOS_CHANNEL_ID;
    if (!channelId || !_discordClient) {
        _cache = envFallbacks();
        return { source: 'env', count: 0, types: [] };
    }

    const channel = await _discordClient.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        _cache = { ..._cache, ...envFallbacks() };
        return { source: 'env_fallback', count: 0, types: [] };
    }

    const newCache = { ...envFallbacks() }; // start with .env fallbacks
    const pngOrder = [];

    let before = null;
    let scanned = 0;
    const maxScan = 500;

    while (scanned < maxScan) {
        const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
        if (!batch || batch.size === 0) break;

        // Process oldest-first so PNG_SEQUENCE_MAP indexes are correct (reverse sort by timestamp)
        const msgs = [...batch.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

        for (const msg of msgs) {
            scanned++;
            for (const att of msg.attachments.values()) {
                const filename = String(att.name || '').toLowerCase();
                const url = att.url;
                if (!url) continue;

                // Named match
                if (FILENAME_MAP[filename]) {
                    newCache[FILENAME_MAP[filename]] = url;
                    continue;
                }

                // PNG sequence (image.png)
                if (filename === 'image.png') {
                    pngOrder.push(url);
                }
            }
        }

        before = batch.last()?.id;
        if (batch.size < 100) break;
    }

    // Assign PNG sequence
    for (let i = 0; i < pngOrder.length && i < PNG_SEQUENCE_MAP.length; i++) {
        const key = PNG_SEQUENCE_MAP[i];
        if (!newCache[key] || newCache[key] === envFallbacks()[key]) {
            // Only override if not already set by filename match
            newCache[key] = pngOrder[i];
        }
    }

    _cache = newCache;
    _refreshedAt = new Date();

    const populated = Object.entries(_cache).filter(([, v]) => v).map(([k]) => k);
    console.log(`[BannerStore] Refreshed ${populated.length} banners from #logos channel`);
    return { source: 'channel', count: populated.length, types: populated };
}

/** Auto-refresh if cache is stale. Safe to call frequently. */
async function autoRefresh() {
    if (_refreshedAt && (Date.now() - _refreshedAt.getTime()) < REFRESH_INTERVAL_MS) return;
    await refreshFromChannel().catch((err) => console.warn('[BannerStore] Auto-refresh failed:', err.message));
}

/** Status summary for admin panel. */
function getStatus() {
    return {
        refreshedAt:  _refreshedAt ? _refreshedAt.toISOString() : null,
        bannerCount:  Object.values(_cache).filter(Boolean).length,
        banners:      Object.fromEntries(
            Object.entries(_cache).map(([k, v]) => [k, v ? '✓ set' : '⊘ missing'])
        ),
    };
}

module.exports = { setDiscordClient, getBanner, refreshFromChannel, autoRefresh, getStatus };
