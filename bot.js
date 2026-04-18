'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

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

async function main() {
    await connect();

    const commands = loadCommands();
    await registerCommands(commands);

    attachInteractionHandler(client, commands);

    client.once('ready', () => {
        installDiscordLogRelay(client, process.env.BOT_LOGS_CHANNEL_ID);
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
    });

    await client.login(process.env.BOT_TOKEN);
}

main().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});
