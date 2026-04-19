const http = require('http');
const url = require('url');
const crypto = require('crypto');
const { processExternalEvent, getPlayerHudState } = require('./service');

let server         = null;
let _discordClient = null;

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

function startIntegrationWebhookServer() {
    if (server) return;

    const port = Number(process.env.INTEGRATION_PORT || 8787);
    const secret = process.env.INTEGRATION_WEBHOOK_SECRET || '';

    if (!secret) {
        console.warn('WARNING: INTEGRATION_WEBHOOK_SECRET missing - integration webhook server disabled.');
        return;
    }

    server = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;
        const query = parsedUrl.query;

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

        if (req.method !== 'POST') {
            safeJson(res, 404, { ok: false, error: 'not_found' });
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
                    const valid = secret
                        ? (token.length > 0 && crypto.timingSafeEqual(
                            Buffer.from(secret),
                            Buffer.from(token.padEnd(secret.length, '\0').slice(0, secret.length)),
                          ))
                        : true;  // allow if no secret set

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
                if (!signature || !secret || !validateSignature(rawBody, signature, secret)) {
                    return;
                }
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
