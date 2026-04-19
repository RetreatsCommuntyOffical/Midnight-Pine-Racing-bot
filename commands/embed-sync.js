const { PermissionFlagsBits } = require('discord.js');
const { runLinuxEmbedSync, getLinuxSyncStatus } = require('../core/integration/linuxEmbedSync');

module.exports = {
    data: {
        name: 'embed-sync',
        description: 'Sync embed payloads (local file or remote source).',
        defaultMemberPermissions: String(PermissionFlagsBits.Administrator),
        options: [
            { type: 1, name: 'run', description: 'Run embed sync now.' },
            { type: 1, name: 'status', description: 'Show embed sync service status.' },
        ],
    },

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator only.', flags: 64 });
            return;
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'status') {
            const s = getLinuxSyncStatus();
            await interaction.reply({
                flags: 64,
                content: [
                    `enabled: ${s.enabled}`,
                    `running: ${s.running}`,
                    `lastRunAt: ${s.lastRunAt ? new Date(s.lastRunAt).toISOString() : 'never'}`,
                    `lastSuccessAt: ${s.lastSuccessAt ? new Date(s.lastSuccessAt).toISOString() : 'never'}`,
                    `lastError: ${s.lastError || 'none'}`,
                    `lastStats: total=${s.lastStats?.total || 0}, created=${s.lastStats?.created || 0}, updated=${s.lastStats?.updated || 0}, skipped=${s.lastStats?.skipped || 0}, missingChannels=${s.lastStats?.missingChannels || 0}`,
                ].join('\n'),
            });
            return;
        }

        await interaction.deferReply({ flags: 64 });
        const result = await runLinuxEmbedSync(interaction.client, 'slash-command');
        if (!result.ok) {
            await interaction.editReply(`Embed sync failed: ${result.error || result.reason || 'unknown_error'}`);
            return;
        }

        const stats = result.stats;
        await interaction.editReply(
            `Embed sync complete. total=${stats.total}, created=${stats.created}, updated=${stats.updated}, skipped=${stats.skipped}, missingChannels=${stats.missingChannels}`
        );
    },
};
