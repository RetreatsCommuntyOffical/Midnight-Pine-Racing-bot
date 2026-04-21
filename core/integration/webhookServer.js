const http  = require('http');
const https = require('https');
const crypto = require('crypto');
const { processExternalEvent, getPlayerHudState } = require('./service');
const { getDesktopOverview } = require('./desktopDashboardService');
const DesktopPlayer = require('../../models/DesktopPlayer');
const BannerStore   = require('../racing/bannerStore');

let server         = null;
let _discordClient = null;

// ── Discord OAuth2 pending results (state → {result, createdAt}) ─────────────
// Consumed once, TTL 10 min
const _pendingOAuth = new Map();
setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [state, entry] of _pendingOAuth) {
        if (entry.createdAt < cutoff) _pendingOAuth.delete(state);
    }
}, 60_000).unref();

// ── Idempotency cache — deduplicates mutation POST requests ──────────────────
// Keys are x-request-id values; value is {respondedAt}. TTL 5 min.
const _seenRequestIds = new Map();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
setInterval(() => {
    const cutoff = Date.now() - IDEMPOTENCY_TTL_MS;
    for (const [id, entry] of _seenRequestIds) {
        if (entry.respondedAt < cutoff) _seenRequestIds.delete(id);
    }
}, 60_000).unref();

/**
 * Returns true and sends a 200 duplicate response if the request ID was already
 * processed.  Returns false if the request is new (caller should process it).
 * Pass `null` or empty string to skip the check (unauthenticated or legacy clients).
 */
function checkIdempotency(req, res) {
    const requestId = String(req.headers['x-request-id'] || '').trim().slice(0, 128);
    if (!requestId) return false;
    if (_seenRequestIds.has(requestId)) {
        safeJson(res, 200, { ok: true, duplicate: true });
        return true;
    }
    _seenRequestIds.set(requestId, { respondedAt: Date.now() });
    return false;
}

function _discordTokenExchange(code) {
    const port        = Number(process.env.INTEGRATION_PORT || 8787);
    const clientId    = String(process.env.CLIENT_ID || process.env.DISCORD_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.DISCORD_CLIENT_SECRET || '').trim();
    const redirectUri = `http://localhost:${port}/auth/discord/callback`;
    const body = new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  redirectUri,
    }).toString();
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'discord.com',
            path:     '/api/v10/oauth2/token',
            method:   'POST',
            headers:  { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
        }, (res) => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Bad JSON from Discord token endpoint')); } });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function _discordApiGet(path, accessToken) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'discord.com',
            path:     `/api/v10${path}`,
            method:   'GET',
            headers:  { Authorization: `Bearer ${accessToken}` },
        }, (res) => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Bad JSON from Discord API')); } });
        });
        req.on('error', reject);
        req.end();
    });
}

function _oauthClosePage(res, status, message) {
    const color = status === 'ok' ? '#22c55e' : '#ef4444';
    const title = status === 'ok' ? '✓ Logged In' : '✕ Login Failed';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Midnight Pine</title>
<style>*{box-sizing:border-box;}body{background:#0a0a0a;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
.card{background:#111;border:1px solid ${color};border-radius:12px;padding:32px;text-align:center;max-width:360px;}
h2{margin:0 0 8px;font-size:1.3rem;color:${color};}p{margin:8px 0 0;color:#aaa;font-size:.9rem;}.logo{font-size:2rem;margin-bottom:12px;}</style></head>
<body><div class="card"><div class="logo">🌲</div><h2>${title}</h2><p>${message}</p><p style="margin-top:16px;font-size:.8rem;color:#555;">This window will close automatically.</p></div>
<script>setTimeout(()=>{try{window.close();}catch(e){}},2000);</script></body></html>`);
}

/** Called from bot.js once the Discord client is ready. */
function setDiscordClient(client) {
    _discordClient = client;
}

function safeJson(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
}

function verifySignature(rawBody, signature, secret) {
    if (!secret) return false;
    if (!signature) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const provided = signature.replace(/^sha256=/, '');
    if (expected.length !== provided.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

function extractDesktopToken(req, query) {
    const authHeader = String(req.headers.authorization || '');
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    return String(
        query.token ||
        req.headers['x-desktop-token'] ||
        bearer ||
        ''
    ).trim();
}

function isDesktopAuthorized(req, query) {
    const expected = String(process.env.DESKTOP_APP_TOKEN || '').trim();
    if (!expected) return true;

    const provided = extractDesktopToken(req, query);
    if (!provided) return false;
    if (provided.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function isImageAttachment(attachment) {
    const contentType = String(attachment?.contentType || '').toLowerCase();
    if (contentType.startsWith('image/')) return true;
    const url = String(attachment?.url || '').toLowerCase();
    return /\.(png|jpg|jpeg|webp|gif)(\?|$)/.test(url);
}

function isImageUrl(value) {
    const raw = String(value || '');
    const url = raw.toLowerCase();
    if (!/^https?:\/\//.test(url)) return false;

    if (/\.(png|jpg|jpeg|webp|gif)(\?|$)/.test(url)) return true;

    // Discord CDN attachment links may appear without clean file extensions.
    return /cdn\.discordapp\.com\/attachments\//.test(url) || /media\.discordapp\.net\/attachments\//.test(url);
}

function extractUrlsFromText(text) {
    const input = String(text || '');
    if (!input) return [];
    const matches = input.match(/https?:\/\/[^\s<>"')]+/gi);
    return Array.isArray(matches) ? matches : [];
}

function normalizeAssetUrl(rawUrl) {
    const source = String(rawUrl || '').trim();
    if (!source) return '';

    try {
        const parsed = new URL(source);
        const host = parsed.hostname.toLowerCase();

        // Discord attachment URLs often include expiring query params (`ex`, `is`, `hm`).
        // Strip them so desktop clients use stable CDN paths.
        if (host === 'cdn.discordapp.com' || host === 'media.discordapp.net') {
            return `${parsed.origin}${parsed.pathname}`;
        }
        return parsed.toString();
    } catch {
        return source;
    }
}

async function getDesktopChannelAssets(limit = 12) {
    if (!_discordClient) return [];

    const logosChannelId = String(process.env.LOGOS_CHANNEL_ID || '').trim() || '1494964462573326477';
    if (!logosChannelId) return [];

    const channel = await _discordClient.channels.fetch(logosChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return [];

    const seenUrls = new Set();
    const maxScanMessages = 500;
    let scanned = 0;
    let before = null;

    const assets = [];

    while (scanned < maxScanMessages && assets.length < limit) {
        const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
        if (!batch || batch.size === 0) break;

        for (const msg of batch.values()) {
            scanned += 1;

            for (const attachment of msg.attachments.values()) {
                if (!isImageAttachment(attachment)) continue;
                const normalizedUrl = normalizeAssetUrl(attachment.url);
                if (!normalizedUrl) continue;
                if (seenUrls.has(normalizedUrl)) continue;
                seenUrls.add(normalizedUrl);
                assets.push({
                    url: normalizedUrl,
                    name: attachment.name || 'asset',
                    messageId: msg.id,
                    createdAt: msg.createdAt ? msg.createdAt.toISOString() : null,
                });
                if (assets.length >= limit) return assets;
            }

            for (const embed of msg.embeds || []) {
                const candidates = [embed?.image?.url, embed?.thumbnail?.url].filter(Boolean);
                for (const imageUrl of candidates) {
                    if (!isImageUrl(imageUrl)) continue;
                    const normalizedUrl = normalizeAssetUrl(imageUrl);
                    if (!normalizedUrl) continue;
                    if (seenUrls.has(normalizedUrl)) continue;
                    seenUrls.add(normalizedUrl);
                    assets.push({
                        url: normalizedUrl,
                        name: embed?.title || 'embedded-image',
                        messageId: msg.id,
                        createdAt: msg.createdAt ? msg.createdAt.toISOString() : null,
                    });
                    if (assets.length >= limit) return assets;
                }
            }

            for (const contentUrl of extractUrlsFromText(msg.content)) {
                if (!isImageUrl(contentUrl)) continue;
                const normalizedUrl = normalizeAssetUrl(contentUrl);
                if (!normalizedUrl) continue;
                if (seenUrls.has(normalizedUrl)) continue;
                seenUrls.add(normalizedUrl);
                assets.push({
                    url: normalizedUrl,
                    name: 'linked-image',
                    messageId: msg.id,
                    createdAt: msg.createdAt ? msg.createdAt.toISOString() : null,
                });
                if (assets.length >= limit) return assets;
            }

            if (scanned >= maxScanMessages) break;
        }

        before = batch.last()?.id;
    }

    if (assets.length > 0) return assets;

    const envFallbackUrls = [
        process.env.WELCOME_BANNER_URL,
        process.env.ROLE_SELECTION_BANNER_URL,
        process.env.SUPPORT_HUB_BANNER_URL,
        process.env.TEAM_HUB_BANNER_URL,
        process.env.SOLO_BOARD_BANNER_URL,
        process.env.STREET_BOARD_BANNER_URL,
        process.env.CIRCUIT_BOARD_BANNER_URL,
        process.env.TEAMS_BANNER_URL,
    ].map((assetUrl) => normalizeAssetUrl(assetUrl)).filter(Boolean);

    const dedup = [];
    const seen = new Set();
    for (const url of envFallbackUrls) {
        if (seen.has(url)) continue;
        seen.add(url);
        dedup.push({
            url,
            name: 'env-banner',
            messageId: null,
            createdAt: null,
        });
        if (dedup.length >= limit) break;
    }

    return dedup;
}

function startIntegrationWebhookServer() {
    if (server) return;

    const port = Number(process.env.INTEGRATION_PORT || 8787);
    const secret = process.env.INTEGRATION_WEBHOOK_SECRET || '';
    const ingestEnabled = !!secret;

    if (!ingestEnabled) {
        console.warn('WARNING: INTEGRATION_WEBHOOK_SECRET missing - ingest POST routes are disabled.');
    }

    server = http.createServer(async (req, res) => {
        const startTime = Date.now();
        const requestId = req.headers['x-request-id'] || `auto-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        
        let _parsedUrl;
        try {
            _parsedUrl = new URL(req.url, 'http://localhost');
        } catch {
            console.log(`[API] ${requestId} BAD_URL ${req.method} ${req.url}`);
            safeJson(res, 400, { ok: false, error: 'bad_url' });
            return;
        }
        const pathname = _parsedUrl.pathname;
        const query = Object.fromEntries(_parsedUrl.searchParams.entries());
        
        // Log all API requests with duration tracking
        const originalEnd = res.end;
        res.end = function(...args) {
            const duration = Date.now() - startTime;
            const statusCode = res.statusCode || 500;
            const method = req.method;
            const status = statusCode < 300 ? 'OK' : statusCode < 400 ? 'REDIRECT' : statusCode < 500 ? 'CLIENT_ERR' : 'SERVER_ERR';
            console.log(`[API] ${requestId} ${status} ${method} ${pathname} (${duration}ms)`);
            originalEnd.apply(res, args);
        };

        // ── CORS headers for all responses (desktop app is file:// origin) ──
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-desktop-token, Authorization');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        // ── GET /auth/discord  (initiate Discord OAuth2) ──────────────────────
        if (req.method === 'GET' && pathname === '/auth/discord') {
            const clientId     = String(process.env.CLIENT_ID || process.env.DISCORD_CLIENT_ID || '').trim();
            const clientSecret = String(process.env.DISCORD_CLIENT_SECRET || '').trim();
            if (!clientId || !clientSecret) {
                res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<h2 style="font-family:sans-serif;color:#ef4444;padding:32px">Discord OAuth not configured.<br>Add DISCORD_CLIENT_SECRET to .env and restart the bot.</h2>');
                return;
            }
            const state       = String(query.state || crypto.randomBytes(16).toString('hex'));
            const port        = Number(process.env.INTEGRATION_PORT || 8787);
            const redirectUri = encodeURIComponent(`http://localhost:${port}/auth/discord/callback`);
            const oauthUrl    = `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify&state=${encodeURIComponent(state)}`;
            res.writeHead(302, { Location: oauthUrl });
            res.end();
            return;
        }

        // ── GET /auth/discord/callback  (OAuth2 code exchange) ────────────────
        if (req.method === 'GET' && pathname === '/auth/discord/callback') {
            const code  = String(query.code  || '').trim();
            const state = String(query.state || '').trim();
            const error = String(query.error || '').trim();
            if (error) {
                _oauthClosePage(res, 'error', `Discord declined: ${error}`);
                return;
            }
            if (!code || !state) {
                _oauthClosePage(res, 'error', 'Missing code or state. Try again.');
                return;
            }
            try {
                const tokenData = await _discordTokenExchange(code);
                if (!tokenData.access_token) {
                    const discordErr = tokenData.error_description || tokenData.error || JSON.stringify(tokenData);
                    console.error('[auth/discord/callback] Token exchange failed:', discordErr);
                    _oauthClosePage(res, 'error', `Token exchange failed: ${discordErr}`);
                    return;
                }
                const userInfo = await _discordApiGet('/users/@me', tokenData.access_token);
                if (!userInfo.id) {
                    _oauthClosePage(res, 'error', 'Could not fetch Discord user info.');
                    return;
                }
                const avatarUrl = userInfo.avatar
                    ? `https://cdn.discordapp.com/avatars/${userInfo.id}/${userInfo.avatar}.png?size=128`
                    : null;
                _pendingOAuth.set(state, {
                    createdAt: Date.now(),
                    result: {
                        id:            userInfo.id,
                        username:      userInfo.username,
                        discriminator: userInfo.discriminator || '0',
                        avatarUrl,
                    },
                });
                _oauthClosePage(res, 'ok', `Welcome, ${userInfo.username}! Returning to Midnight Pine…`);
            } catch (err) {
                console.error('[auth/discord/callback]', err.message);
                _oauthClosePage(res, 'error', 'Internal error during authentication. Check bot logs.');
            }
            return;
        }

        // ── GET /auth/discord/poll  (app polls for completed OAuth result) ─────
        if (req.method === 'GET' && pathname === '/auth/discord/poll') {
            const state = String(query.state || '').trim();
            if (!state) { safeJson(res, 400, { ok: false, error: 'missing_state' }); return; }
            const entry = _pendingOAuth.get(state);
            if (!entry) { safeJson(res, 202, { ok: false, pending: true }); return; }
            _pendingOAuth.delete(state); // consume once
            safeJson(res, 200, { ok: true, data: entry.result });
            return;
        }

        // ── GET /hud/state  (fetch player HUD state) ──────────────────────────
        if (req.method === 'GET' && pathname === '/hud/state') {
            const discordId = query.discordId || null;
            if (!discordId) {
                safeJson(res, 400, { ok: false, error: 'missing_discord_id' });
                return;
            }

            try {
                const hudState = await getPlayerHudState(discordId);
                if (!hudState) {
                    safeJson(res, 404, { ok: false, error: 'player_not_found' });
                    return;
                }
                safeJson(res, 200, { ok: true, data: hudState });
            } catch (err) {
                console.error('[hud/state] Error:', err.message);
                safeJson(res, 500, { ok: false, error: 'internal_error' });
            }
            return;
        }

        // ── GET /desktop/overview  (desktop launcher data snapshot) ──────────
        if (req.method === 'GET' && pathname === '/desktop/overview') {
            if (!isDesktopAuthorized(req, query)) {
                safeJson(res, 401, { ok: false, error: 'unauthorized' });
                return;
            }

            try {
                const [data, assets] = await Promise.all([
                    getDesktopOverview(),
                    getDesktopChannelAssets(16),
                ]);
                data.assets = assets;
                safeJson(res, 200, { ok: true, data });
            } catch (err) {
                console.error('[desktop/overview] Error:', err.message);
                safeJson(res, 500, { ok: false, error: 'internal_error' });
            }
            return;
        }

        // ── GET /desktop/player  (fetch desktop player stats) ──────────────
        if (req.method === 'GET' && pathname === '/desktop/player') {
            if (!isDesktopAuthorized(req, query)) {
                safeJson(res, 401, { ok: false, error: 'unauthorized' });
                return;
            }
            const username = String(query.username || '').trim().slice(0, 32);
            if (!username) {
                safeJson(res, 400, { ok: false, error: 'missing_username' });
                return;
            }
            try {
                const player = await DesktopPlayer.findOne({ username }).lean();
                if (!player) {
                    safeJson(res, 404, { ok: false, error: 'player_not_found' });
                    return;
                }
                safeJson(res, 200, { ok: true, data: {
                    username:     player.username,
                    totalTimeSec: player.totalTimeSec,
                    sessionCount: player.sessionCount,
                    lastSeenAt:   player.lastSeenAt,
                }});
            } catch (err) {
                console.error('[desktop/player] Error:', err.message);
                safeJson(res, 500, { ok: false, error: 'internal_error' });
            }
            return;
        }

        // ── POST /desktop/session  (heartbeat — increment play time) ─────────
        if (req.method === 'POST' && pathname === '/desktop/session') {
            if (!isDesktopAuthorized(req, query)) {
                safeJson(res, 401, { ok: false, error: 'unauthorized' });
                return;
            }
            if (checkIdempotency(req, res)) return;
            const sessionChunks = [];
            req.on('data', (c) => sessionChunks.push(c));
            req.on('end', async () => {
                try {
                    let body;
                    try { body = JSON.parse(Buffer.concat(sessionChunks).toString('utf8')); }
                    catch { safeJson(res, 400, { ok: false, error: 'invalid_json' }); return; }

                    const rawUsername = String(body.username || '').trim().slice(0, 32);
                    if (!rawUsername || !/^[a-zA-Z0-9 _.\-]{2,32}$/.test(rawUsername)) {
                        safeJson(res, 400, { ok: false, error: 'invalid_username' });
                        return;
                    }
                    const deltaSec    = Math.max(0, Math.min(60, Number(body.deltaSec || 10)));
                    const isNewSession = !!body.newSession;

                    const player = await DesktopPlayer.findOneAndUpdate(
                        { username: rawUsername },
                        {
                            $inc: { totalTimeSec: deltaSec, ...(isNewSession ? { sessionCount: 1 } : {}) },
                            $set: { lastSeenAt: new Date() },
                        },
                        { upsert: true, new: true, setDefaultsOnInsert: true }
                    );
                    safeJson(res, 200, { ok: true, data: { totalTimeSec: player.totalTimeSec } });
                } catch (err) {
                    console.error('[desktop/session] Error:', err.message);
                    safeJson(res, 500, { ok: false, error: 'internal_error' });
                }
            });
            return;
        }

        // ── GET /desktop/leaderboard  (top desktop drivers by best score) ──────
        if (req.method === 'GET' && pathname === '/desktop/leaderboard') {
            if (!isDesktopAuthorized(req, query)) {
                safeJson(res, 401, { ok: false, error: 'unauthorized' });
                return;
            }
            try {
                const limit = Math.max(1, Math.min(25, Number(query.limit || 10)));
                const rows = await DesktopPlayer.find({ totalRuns: { $gt: 0 } })
                    .sort({ bestScore: -1 })
                    .limit(limit)
                    .lean();
                safeJson(res, 200, { ok: true, data: rows.map((p, i) => ({
                    rank:        i + 1,
                    username:    p.username,
                    bestScore:   p.bestScore,
                    totalRuns:   p.totalRuns,
                    cleanRuns:   p.cleanRuns,
                    totalScore:  p.totalScore,
                    lastRunRoute: p.lastRunRoute || null,
                    lastRunAt:   p.lastRunAt ? p.lastRunAt.toISOString() : null,
                })) });
            } catch (err) {
                console.error('[desktop/leaderboard] Error:', err.message);
                safeJson(res, 500, { ok: false, error: 'internal_error' });
            }
            return;
        }

        // ── GET /admin/status  (owner-only bot health) ──────────────────────
        if (req.method === 'GET' && pathname === '/admin/status') {
            if (!isDesktopAuthorized(req, query)) {
                safeJson(res, 401, { ok: false, error: 'unauthorized' });
                return;
            }
            const ownerDiscordId = String(process.env.OWNER_ID || '').trim();
            const requesterId = String(query.ownerDiscordId || '').trim();
            if (!ownerDiscordId || requesterId !== ownerDiscordId) {
                safeJson(res, 403, { ok: false, error: 'forbidden' });
                return;
            }
            try {
                const client = _discordClient;
                const guild = client
                    ? (client.guilds.cache.get(process.env.HOME_GUILD_ID) || client.guilds.cache.first())
                    : null;

                safeJson(res, 200, { ok: true, data: {
                    online:      !!client?.isReady(),
                    botTag:      client?.user?.tag || 'Offline',
                    ping:        client?.ws?.ping ?? -1,
                    uptime:      client?.uptime
                        ? (() => {
                            const s = Math.floor(client.uptime / 1000);
                            const h = Math.floor(s / 3600);
                            const m = Math.floor((s % 3600) / 60);
                            return `${h}h ${m}m`;
                        })()
                        : '--',
                    guildName:   guild?.name || '--',
                    memberCount: guild?.memberCount || 0,
                    bannerStatus: BannerStore.getStatus(),
                }});
            } catch (err) {
                console.error('[admin/status] Error:', err.message);
                safeJson(res, 500, { ok: false, error: 'internal_error' });
            }
            return;
        }

        // ── POST /admin/action  (owner-only bot control) ─────────────────────
        if (req.method === 'POST' && pathname === '/admin/action') {
            if (!isDesktopAuthorized(req, query)) {
                safeJson(res, 401, { ok: false, error: 'unauthorized' });
                return;
            }
            const actionChunks = [];
            req.on('data', (c) => actionChunks.push(c));
            req.on('end', async () => {
                let body;
                try { body = JSON.parse(Buffer.concat(actionChunks).toString('utf8')); }
                catch { safeJson(res, 400, { ok: false, error: 'invalid_json' }); return; }

                const ownerDiscordId = String(process.env.OWNER_ID || '').trim();
                const requesterId = String(body.ownerDiscordId || '').trim();
                if (!ownerDiscordId || requesterId !== ownerDiscordId) {
                    safeJson(res, 403, { ok: false, error: 'forbidden' });
                    return;
                }

                const action = String(body.action || '');
                const client = _discordClient;

                try {
                    if (action === 'refresh_banner_urls') {
                        const result = await BannerStore.refreshFromChannel();
                        safeJson(res, 200, { ok: true, data: result });
                        return;
                    }

                    if (action === 'refresh_embeds') {
                        const { refreshAllLeaderboards } = require('../racing/leaderboardPoster');
                        const { postTeamHubEmbed } = require('../teamHubService');
                        const { postSupportHubEmbed } = require('../ticketService');
                        const guild = client
                            ? (client.guilds.cache.get(process.env.HOME_GUILD_ID) || client.guilds.cache.first())
                            : null;
                        await BannerStore.refreshFromChannel().catch(() => null);
                        await Promise.allSettled([
                            refreshAllLeaderboards(client, guild),
                            postTeamHubEmbed(client, process.env.TEAM_HUB_CHANNEL_ID),
                            postSupportHubEmbed(client, process.env.SUPPORT_HUB_CHANNEL_ID),
                        ]);
                        safeJson(res, 200, { ok: true, data: { message: 'All embeds refreshed' } });
                        return;
                    }

                    if (action === 'force_leaderboard') {
                        const { postLeaderboardToChannel } = require('../racing/leaderboardPoster');
                        const boardType = String(body.boardType || 'solo');
                        const guild = client
                            ? (client.guilds.cache.get(process.env.HOME_GUILD_ID) || client.guilds.cache.first())
                            : null;
                        await postLeaderboardToChannel(client, guild, boardType);
                        safeJson(res, 200, { ok: true, data: { boardType } });
                        return;
                    }

                    if (action === 'force_digest') {
                        const { triggerDailyDigestNow } = require('../racing/dailyDigestService');
                        const guild = client
                            ? (client.guilds.cache.get(process.env.HOME_GUILD_ID) || client.guilds.cache.first())
                            : null;
                        await triggerDailyDigestNow(client, guild);
                        safeJson(res, 200, { ok: true, data: { message: 'Digest triggered' } });
                        return;
                    }

                    if (action === 'announce') {
                        const message = String(body.message || '').trim().slice(0, 2000);
                        if (!message) {
                            safeJson(res, 400, { ok: false, error: 'missing_message' });
                            return;
                        }
                        const channelId = process.env.ANNOUNCEMENTS_CHANNEL_ID;
                        if (channelId && client) {
                            const ch = await client.channels.fetch(channelId).catch(() => null);
                            if (ch?.isTextBased()) await ch.send({ content: message });
                        }
                        safeJson(res, 200, { ok: true, data: { message: 'Announced' } });
                        return;
                    }

                    safeJson(res, 400, { ok: false, error: `unknown_action: ${action}` });
                } catch (err) {
                    console.error('[admin/action] Error:', err.message);
                    safeJson(res, 500, { ok: false, error: 'internal_error' });
                }
            });
            return;
        }

        // ── POST /desktop/run  (run completion from desktop app) ─────────────
        if (req.method === 'POST' && pathname === '/desktop/run') {
            if (!isDesktopAuthorized(req, query)) {
                safeJson(res, 401, { ok: false, error: 'unauthorized' });
                return;
            }
            if (checkIdempotency(req, res)) return;
            const runChunks = [];
            req.on('data', (c) => runChunks.push(c));
            req.on('end', async () => {
                try {
                    let body;
                    try { body = JSON.parse(Buffer.concat(runChunks).toString('utf8')); }
                    catch { safeJson(res, 400, { ok: false, error: 'invalid_json' }); return; }

                    const rawUsername = String(body.username || '').trim().slice(0, 32);
                    if (!rawUsername || !/^[a-zA-Z0-9 _.\-]{2,32}$/.test(rawUsername)) {
                        safeJson(res, 400, { ok: false, error: 'invalid_username' });
                        return;
                    }

                    const score      = Math.max(0, Math.min(99999, Math.round(Number(body.score || 0))));
                    const clean      = body.clean === true || body.clean === 'true';
                    const isPB       = body.isPB === true || body.isPB === 'true';
                    const maxCombo   = Math.max(1, Math.min(50, Number(body.maxCombo || 1)));
                    const durationSec = Math.max(0, Math.min(7200, Math.round(Number(body.durationSec || 0))));
                    const route      = String(body.route || 'Unknown').trim().slice(0, 64);
                    const clientTs   = Math.max(0, Number(body.clientTs || 0));

                    // Server-side run dedup: reject if same content hash already recorded within 10 minutes.
                    // This survives server restarts (stored in DB), preventing double-count from retry queues.
                    const runHash = clientTs > 0
                        ? `${score}-${route}-${clientTs}`
                        : null;

                    if (runHash) {
                        const existing = await DesktopPlayer.findOne({ username: rawUsername, lastRunHash: runHash });
                        if (existing) {
                            // Idempotent: return success with current stats
                            safeJson(res, 200, { ok: true, deduplicated: true, data: {
                                totalRuns:  existing.totalRuns,
                                bestScore:  existing.bestScore,
                                cleanRuns:  existing.cleanRuns,
                                totalScore: existing.totalScore,
                            }});
                            return;
                        }
                    }

                    const updateOps = {
                        $inc: {
                            totalRuns:  1,
                            totalScore: score,
                            ...(clean ? { cleanRuns: 1 } : {}),
                        },
                        $set: {
                            lastSeenAt:   new Date(),
                            lastRunAt:    new Date(),
                            lastRunRoute: route,
                            ...(runHash ? { lastRunHash: runHash } : {}),
                        },
                    };

                    // Only set bestScore if it's a new PB or higher than stored
                    if (isPB || score > 0) {
                        updateOps.$max = { bestScore: score };
                    }

                    const player = await DesktopPlayer.findOneAndUpdate(
                        { username: rawUsername },
                        updateOps,
                        { upsert: true, new: true, setDefaultsOnInsert: true }
                    );

                    safeJson(res, 200, { ok: true, data: {
                        totalRuns:  player.totalRuns,
                        bestScore:  player.bestScore,
                        cleanRuns:  player.cleanRuns,
                        totalScore: player.totalScore,
                    }});
                } catch (err) {
                    console.error('[desktop/run] Error:', err.message);
                    safeJson(res, 500, { ok: false, error: 'internal_error' });
                }
            });
            return;
        }

        if (req.method !== 'POST') {
            safeJson(res, 404, { ok: false, error: 'not_found' });
            return;
        }

        // ── GET /desktop/leaderboard  (top desktop drivers by best score) ──────
        // (reached via GET earlier; this block is for POST-path fall-through guard)

        if (!ingestEnabled) {
            safeJson(res, 503, { ok: false, error: 'ingest_disabled_missing_secret' });
            return;
        }

        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', async () => {
            try {
                const rawBody   = Buffer.concat(chunks).toString('utf8');
                const signature = req.headers['x-midnight-signature'];

                // â”€â”€ /ingest/music  (FiveM bearer-token auth) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                if (pathname === '/ingest/music') {
                    const tokenHeader = String(signature || '');
                    const token       = tokenHeader.replace(/^token\s+/i, '');
                                        const valid = token.length > 0 && crypto.timingSafeEqual(
                                                Buffer.from(secret),
                                                Buffer.from(token.padEnd(secret.length, '\0').slice(0, secret.length)),
                                        );

                    if (!valid) {
                        safeJson(res, 401, { ok: false, error: 'invalid_token' });
                        return;
                    }

                    let body;
                    try   { body = JSON.parse(rawBody); }
                    catch { safeJson(res, 400, { ok: false, error: 'invalid_json' }); return; }

                    await handleMusicEvent(body).catch((e) => console.error('[music webhook]', e.message));
                    safeJson(res, 200, { ok: true });
                    return;
                }

                // â”€â”€ /ingest/activity  (HMAC-signed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                if (pathname !== '/ingest/activity') {
                    safeJson(res, 404, { ok: false, error: 'not_found' });
                    return;
                }

                if (!signature || !secret || !verifySignature(rawBody, signature, secret)) {
                    safeJson(res, 401, { ok: false, error: 'invalid_signature' });
                    return;
                }

                let body;
                try {
                    body = JSON.parse(rawBody);
                } catch {
                    safeJson(res, 400, { ok: false, error: 'invalid_json' });
                    return;
                }

                const eventId = body.eventId;
                const eventType = body.eventType;
                const discordId = body.discordId;
                const payload = body.payload || {};

                if (!eventId || !eventType || !discordId) {
                    safeJson(res, 400, { ok: false, error: 'missing_required_fields' });
                    return;
                }

                const result = await processExternalEvent({ eventId, eventType, discordId, payload });
                safeJson(res, result.accepted ? 200 : 422, { ok: result.accepted, duplicate: result.duplicate, reason: result.reason || null });
            } catch (err) {
                console.error('Integration webhook error:', err.message);
                safeJson(res, 500, { ok: false, error: 'internal_error' });
            }
        });
    });

    server.listen(port, () => {
        console.log(`âœ… Integration webhook server listening on port ${port}`);
    });
}

function stopIntegrationWebhookServer() {
    if (!server) return;
    server.close();
    server = null;
}

// â”€â”€ Music event handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function handleMusicEvent(body) {
    const { eventType, discordId, payload = {} } = body;
    if (!eventType) return;

    if (eventType === 'player_music_prefs' && discordId && discordId !== '0') {
        const { syncFromFiveM } = require('../music/playerPrefsService');
        await syncFromFiveM(payload.fivemId, discordId, payload.prefs || {}).catch(() => null);
        return;
    }

    if (eventType === 'music_track_change' && payload.station) {
        const { setCurrentTrack } = require('../music/stationManager');
        const { postNowPlayingAnnouncement } = require('../music/nowPlayingService');
        await setCurrentTrack(payload.station, {
            title:  payload.title  || 'Unknown Track',
            artist: payload.artist || 'Unknown Artist',
        }).catch(() => null);
        if (_discordClient) {
            await postNowPlayingAnnouncement(_discordClient, payload.station).catch(() => null);
        }
        return;
    }

    if ((eventType === 'event_music_start' || eventType === 'race_start' ||
         eventType === 'drift_start' || eventType === 'countdown' || eventType === 'podium') &&
        _discordClient) {
        const { handleGameplayEvent } = require('../music/eventMusicService');
        await handleGameplayEvent(eventType, payload, _discordClient).catch(() => null);
    }
}

module.exports = {
    startIntegrationWebhookServer,
    stopIntegrationWebhookServer,
    setDiscordClient,
};
