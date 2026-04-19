const https = require('https');
const fs = require('fs');
const path = require('path');

function loadCommands() {
    const commands = new Map();
    const dir = path.join(__dirname, '..', 'commands');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));

    for (const file of files) {
        const mod = require(path.join(dir, file));
        if (mod?.data?.name && typeof mod.execute === 'function') {
            commands.set(mod.data.name, mod);
        }
    }

    return commands;
}

/** PUT to Discord REST using native https to avoid undici hang on Windows. */
function nativePut(route, token, body) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const req = https.request(
            {
                hostname: 'discord.com',
                path: `/api/v10${route}`,
                method: 'PUT',
                headers: {
                    Authorization: `Bot ${token}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                    'User-Agent': 'DiscordBot (midnight-pine-racing, 1.0.0)',
                },
            },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8');
                    if (res.statusCode === 200 || res.statusCode === 201) {
                        try { resolve(JSON.parse(text)); } catch { resolve([]); }
                    } else {
                        const err = new Error(`Discord API ${res.statusCode}: ${text}`);
                        err.status = res.statusCode;
                        try { err.body = JSON.parse(text); } catch { err.body = null; }
                        reject(err);
                    }
                });
            }
        );
        req.on('error', reject);
        req.setTimeout(30_000, () => req.destroy(new Error('Request timed out after 30s')));
        req.write(payload);
        req.end();
    });
}

async function registerCommands(commands) {
    const token = String(process.env.BOT_TOKEN || '').trim();
    const clientId = String(process.env.CLIENT_ID || '').trim();
    const homeGuildId = String(process.env.HOME_GUILD_ID || '').trim();

    if (!token || !clientId || !homeGuildId) {
        console.warn('Missing BOT_TOKEN, CLIENT_ID, or HOME_GUILD_ID - skipping command registration.');
        return;
    }

    const body = [...commands.values()].map((c) =>
        typeof c.data?.toJSON === 'function' ? c.data.toJSON() : c.data
    );
    const route = `/applications/${clientId}/guilds/${homeGuildId}/commands`;

    const MAX_RETRIES = 5;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const result = await nativePut(route, token, body);
            console.log(`✅ Registered ${result.length} slash commands in guild ${homeGuildId}`);
            return;
        } catch (err) {
            if (err.status === 429 && err.body?.retry_after && attempt < MAX_RETRIES) {
                const waitMs = Math.ceil(err.body.retry_after * 1000) + 30_000;
                console.warn(`⏳ Command registration rate limited — waiting ${(waitMs / 1000).toFixed(0)}s before retry...`);
                await new Promise((r) => setTimeout(r, waitMs));
            } else {
                console.warn('⚠️  Command registration failed (bot will still start):', err?.message || err);
                return;
            }
        }
    }
}

module.exports = { loadCommands, registerCommands };
