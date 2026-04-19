/**
 * Standalone command registration script.
 * Run manually if you need to force-push slash commands to your guild
 * outside of bot startup.
 *
 * Uses Node's native https module directly to avoid the undici connection-
 * pooling hang that occurs with discord.js REST on Windows for large payloads.
 *
 * Usage: node deploy-commands.js
 */

require('dotenv').config();
const https  = require('https');
const fs     = require('fs');
const path   = require('path');

const BOT_TOKEN = String(process.env.BOT_TOKEN || '').trim();
const CLIENT_ID = String(process.env.CLIENT_ID || '').trim();
const HOME_GUILD_ID = String(process.env.HOME_GUILD_ID || '').trim();

if (!BOT_TOKEN || !CLIENT_ID || !HOME_GUILD_ID) {
    console.error('Missing BOT_TOKEN, CLIENT_ID, or HOME_GUILD_ID in .env');
    process.exit(1);
}

const commands = [];
const cmdDir   = path.join(__dirname, 'commands');

for (const file of fs.readdirSync(cmdDir).filter((f) => f.endsWith('.js'))) {
    const cmd = require(path.join(cmdDir, file));
    if (cmd?.data?.name) {
        // Explicitly serialise SlashCommandBuilder instances to plain objects.
        commands.push(typeof cmd.data.toJSON === 'function' ? cmd.data.toJSON() : cmd.data);
        console.log(`  Loaded: ${cmd.data.name}`);
    }
}

/** PUT to Discord's REST API using Node's native https — avoids undici on Windows. */
function discordPut(route, body) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const options = {
            hostname: 'discord.com',
            path: `/api/v10${route}`,
            method: 'PUT',
            headers: {
                'Authorization': `Bot ${BOT_TOKEN}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                'User-Agent': 'DiscordBot (midnight-pine-racing, 1.0.0)',
            },
        };

        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                if (res.statusCode === 200 || res.statusCode === 201) {
                    try { resolve(JSON.parse(text)); }
                    catch { resolve([]); }
                } else {
                    // Attach status code and parsed body for caller to inspect.
                    const err = new Error(`Discord API ${res.statusCode}: ${text}`);
                    err.status = res.statusCode;
                    try { err.body = JSON.parse(text); } catch { err.body = null; }
                    reject(err);
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(30_000, () => {
            req.destroy(new Error('Request timed out after 30s'));
        });
        req.write(payload);
        req.end();
    });
}

/** PUT with automatic 429 retry (up to maxRetries times). */
async function discordPutWithRetry(route, body, maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await discordPut(route, body);
        } catch (err) {
            if (err.status === 429 && err.body?.retry_after && attempt < maxRetries) {
                // Add 30s buffer on top of retry_after to avoid resetting the
                // sliding-window bucket with back-to-back requests.
                const waitMs = Math.ceil(err.body.retry_after * 1000) + 30_000;
                console.log(`⏳ Rate limited — waiting ${(waitMs / 1000).toFixed(0)}s before retry (attempt ${attempt}/${maxRetries})...`);
                await new Promise((r) => setTimeout(r, waitMs));
            } else {
                throw err;
            }
        }
    }
}

const ROUTE = `/applications/${CLIENT_ID}/guilds/${HOME_GUILD_ID}/commands`;

(async () => {
    try {
        console.log(`\nRegistering ${commands.length} slash command(s) to guild ${HOME_GUILD_ID}...`);
        const result = await discordPutWithRetry(ROUTE, commands);
        console.log(`✅ Successfully registered ${result.length} command(s).`);
    } catch (err) {
        if (err?.message?.includes('401')) {
            console.error('Registration failed: BOT_TOKEN is invalid or revoked.');
        } else if (err?.status === 429) {
            console.error(`Registration failed: still rate limited after retries. Wait a minute and try again.`);
        } else {
            console.error('Registration failed:', err?.message || err);
        }
        process.exit(1);
    }
})();
