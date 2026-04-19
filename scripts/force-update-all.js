'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const client = require('../core/client');
const { loadCommands, registerCommands } = require('../core/commandHandler');
const { runLinuxEmbedSync } = require('../core/integration/linuxEmbedSync');
const { refreshAllLeaderboards } = require('../core/racing/leaderboardPoster');
const { postTeamHubEmbed } = require('../core/teamHubService');
const { postSupportHubEmbed } = require('../core/ticketService');
const { postOrUpdateTeamRoster } = require('../core/racing/teamRosterPoster');

async function main() {
    const commands = loadCommands();
    await registerCommands(commands);

    await client.login(process.env.BOT_TOKEN);

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timed out waiting for Discord ready event')), 30000);

        client.once('clientReady', async () => {
            clearTimeout(timeout);
            try {
                const guild = client.guilds.cache.get(process.env.HOME_GUILD_ID) || client.guilds.cache.first();
                if (!guild) throw new Error('No guild found for force update run');

                const linuxResult = await runLinuxEmbedSync(client, 'force-update-script');
                if (!linuxResult.ok) {
                    console.warn('Embed sync reported issue:', linuxResult.error || linuxResult.reason || 'unknown');
                }

                await refreshAllLeaderboards(client, guild).catch(() => null);
                await postOrUpdateTeamRoster(client, guild).catch(() => null);
                await postTeamHubEmbed(client, process.env.TEAM_HUB_CHANNEL_ID).catch(() => null);
                await postSupportHubEmbed(client, process.env.SUPPORT_HUB_CHANNEL_ID).catch(() => null);

                const stats = linuxResult.stats || { total: 0, created: 0, updated: 0, skipped: 0, missingChannels: 0 };
                console.log('FORCE_UPDATE_ALL_COMPLETE');
                console.log(`commands=${commands.size}`);
                console.log(`embeds_total=${stats.total}`);
                console.log(`embeds_created=${stats.created}`);
                console.log(`embeds_updated=${stats.updated}`);
                console.log(`embeds_skipped=${stats.skipped}`);
                console.log(`embeds_missing_channels=${stats.missingChannels}`);
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    });
}

main()
    .catch((err) => {
        console.error('force-update-all failed:', err.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await client.destroy().catch(() => null);
    });
