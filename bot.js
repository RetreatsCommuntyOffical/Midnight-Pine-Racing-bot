'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// ── Global crash guards ────────────────────────────────────────────────────
// Prevent unhandled rejections and uncaught exceptions from killing the process.
process.on('unhandledRejection', (reason, promise) => {
    console.error('[unhandledRejection]', reason?.stack || reason);
});
process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err?.stack || err);
});

const { connect } = require('./core/database');
const client = require('./core/client');
const { loadCommands, registerCommands } = require('./core/commandHandler');
const { attachInteractionHandler } = require('./core/interactionHandler');
const { startScheduler } = require('./core/racing/scheduler');
const { refreshAllLeaderboards } = require('./core/racing/leaderboardPoster');
const { postOrUpdateTeamRoster } = require('./core/racing/teamRosterPoster');
const { installDiscordLogRelay } = require('./core/discordLogRelay');
const { postTeamHubEmbed } = require('./core/teamHubService');
const { postSupportHubEmbed } = require('./core/ticketService');
const { startIntegrationWebhookServer } = require('./core/integration/webhookServer');
const { setDiscordClient }               = require('./core/integration/webhookServer');
const { startLinuxEmbedSyncScheduler }   = require('./core/integration/linuxEmbedSync');
const { handleMemberJoin }               = require('./core/welcomeService');
const { seedDefaultStations }            = require('./core/music/stationManager');

async function main() {
    const token = String(process.env.BOT_TOKEN || '').trim();
    if (!token) {
        throw new Error('BOT_TOKEN is missing. Set BOT_TOKEN in .env and restart.');
    }

    await connect();
    startIntegrationWebhookServer();
    await seedDefaultStations().catch(() => null);

    const commands = loadCommands();
    // Fire-and-forget — registration timeout/failure must not block bot startup.
    registerCommands(commands).catch((err) =>
        console.error('⚠️  Background command registration error:', err?.message || err)
    );

    attachInteractionHandler(client, commands);
    if (String(process.env.ENABLE_GUILD_MEMBERS_INTENT || 'false').toLowerCase() === 'true') {
        client.on('guildMemberAdd', (member) => {
            handleMemberJoin(member).catch(() => null);
        });
    }

    client.once('clientReady', () => {
        installDiscordLogRelay(client, process.env.BOT_LOGS_CHANNEL_ID);
        setDiscordClient(client);
        console.log(`✅ ${client.user.tag} online — ${commands.size} commands loaded`);

        startScheduler(client);

        // Refresh leaderboard channels every 4 hours (dynamic guild lookup so cache is always fresh)
        setInterval(() => {
            if (!client.isReady()) return;
            const guild = client.guilds.cache.get(process.env.HOME_GUILD_ID) || client.guilds.cache.first();
            refreshAllLeaderboards(client, guild).catch(() => null);
        }, 4 * 60 * 60 * 1000);

        const guild = client.guilds.cache.get(process.env.HOME_GUILD_ID) || client.guilds.cache.first();
        postOrUpdateTeamRoster(client, guild).catch(() => null);
        postTeamHubEmbed(client, process.env.TEAM_HUB_CHANNEL_ID).catch(() => null);
        postSupportHubEmbed(client, process.env.SUPPORT_HUB_CHANNEL_ID).catch(() => null);

        const linuxSyncTimer = startLinuxEmbedSyncScheduler(client);
        if (linuxSyncTimer) {
            const every = Number(process.env.EMBED_SYNC_INTERVAL_SEC || process.env.LINUX_SYNC_INTERVAL_SEC || 180);
            const source = String(process.env.EMBED_SYNC_SOURCE || 'local').toLowerCase();
            console.log(`✅ Embed sync scheduler enabled (${every}s interval, source=${source})`);
        } else {
            console.log('ℹ️ Embed sync scheduler disabled');
        }
    });

    try {
        await client.login(token);
    } catch (err) {
        if (err?.name === 'TokenInvalid' || err?.code === 'TokenInvalid') {
            throw new Error('Discord login failed: BOT_TOKEN is invalid or revoked. Generate a new bot token and update .env.');
        }
        throw err;
    }
}

main().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});
