const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { buildLeaderboardEmbed } = require('../core/racing/leaderboardPoster');
const { resetWeeklyPoints } = require('../core/racing/service');

module.exports = {
    data: {
        name: 'leaderboard',
        description: 'View live leaderboards.',
        options: [
            {
                type: 3,
                name: 'type',
                description: 'Leaderboard type.',
                required: false,
                choices: [
                    { name: 'Solo (All Points)',     value: 'solo'    },
                    { name: 'Street (No Hesi)',      value: 'street'  },
                    { name: 'Circuit (Races)',        value: 'circuit' },
                    { name: 'Teams',                 value: 'teams'   },
                ],
            },
            { type: 5, name: 'weekly',       description: 'Show this week only.',                required: false },
            { type: 5, name: 'reset_weekly', description: 'Staff: reset all weekly points now.', required: false },
        ],
    },

    async execute(interaction) {
        const type       = interaction.options.getString('type') || 'solo';
        const weekly     = interaction.options.getBoolean('weekly') || false;
        const doReset    = interaction.options.getBoolean('reset_weekly') || false;

        if (doReset) {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                await interaction.reply({ content: 'Only staff can reset weekly points.', ephemeral: true });
                return;
            }
            await resetWeeklyPoints();
            await interaction.reply({ content: '✅ Weekly points reset.', ephemeral: true });
            return;
        }

        await interaction.deferReply();
        const embed = await buildLeaderboardEmbed(type, weekly);
        await interaction.editReply({ embeds: [embed] });
    },
};
