const { PermissionFlagsBits } = require('discord.js');
const { triggerDailyDigestNow, previewDailyDigest } = require('../core/racing/dailyDigestService');

module.exports = {
    data: {
        name: 'digest',
        description: 'Daily quote and event digest controls (staff only).',
        options: [
            {
                type: 1,
                name: 'post-now',
                description: 'Post today\'s digest immediately to configured channels.',
                options: [
                    {
                        type: 5,
                        name: 'force',
                        description: 'Force post even if already posted today.',
                        required: false,
                    },
                ],
            },
            {
                type: 1,
                name: 'preview',
                description: 'Preview today\'s digest in a channel without touching daily state.',
                options: [
                    {
                        type: 7,
                        name: 'channel',
                        description: 'Optional target channel. Defaults to current channel.',
                        required: false,
                    },
                ],
            },
        ],
    },

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({ content: 'Staff only.', flags: 64 });
            return;
        }

        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'post-now') {
                await interaction.deferReply({ flags: 64 });
                const force = interaction.options.getBoolean('force') || false;
                const result = await triggerDailyDigestNow(interaction.client, { force });

                const lines = [
                    `Date: ${result.dateKey}`,
                    `Timezone: ${result.timeZone}`,
                    `Quote posted: ${result.quotePosted ? 'yes' : 'no (already posted)'}`,
                    `Events posted: ${result.eventsPosted ? 'yes' : 'no (already posted)'}`,
                    `Force mode: ${result.force ? 'on' : 'off'}`,
                ];

                await interaction.editReply({ content: `Daily digest run complete.\n${lines.join('\n')}` });
                return;
            }

            if (sub === 'preview') {
                await interaction.deferReply({ flags: 64 });
                const optChannel = interaction.options.getChannel('channel');
                const channelId = optChannel?.id || interaction.channelId;

                await previewDailyDigest(interaction.client, { channelId });
                await interaction.editReply({ content: `Preview posted in <#${channelId}>.` });
            }
        } catch (err) {
            const payload = { content: err.message || 'Digest command failed.', flags: 64 };
            if (interaction.deferred) await interaction.editReply(payload);
            else await interaction.reply(payload);
        }
    },
};
