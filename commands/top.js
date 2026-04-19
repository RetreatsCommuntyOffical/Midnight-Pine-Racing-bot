'use strict';
const { leaderboardEmbed, rows, Buttons, DIVIDER } = require('../core/ui/theme');
const { getLeaderboard } = require('../core/racing/service');

const MEDALS = ['🥇', '🥈', '🥉'];
const TYPE_LABELS = { street: '🏙️ Street (Drift)', circuit: '🏁 Circuit', solo: '⭐ Overall' };

module.exports = {
    data: {
        name: 'top',
        description: 'Show top players by selected leaderboard type.',
        options: [
            {
                type: 3,
                name: 'type',
                description: 'Leaderboard type',
                required: false,
                choices: [
                    { name: 'Drift (Street)', value: 'street' },
                    { name: 'Overall', value: 'solo' },
                    { name: 'Circuit', value: 'circuit' },
                ],
            },
            { type: 4, name: 'limit', description: 'How many players (1-25)', required: false, min_value: 1, max_value: 25 },
            { type: 5, name: 'weekly', description: 'Use weekly board', required: false },
        ],
    },

    async execute(interaction) {
        const type   = interaction.options.getString('type')   || 'street';
        const limit  = interaction.options.getInteger('limit') || 10;
        const weekly = interaction.options.getBoolean('weekly') || false;

        const data = await getLeaderboard(type, limit, weekly);
        if (!data.length) {
            await interaction.reply({ content: 'No data available yet.', flags: 64 });
            return;
        }

        const lines = data.map((row, idx) => {
            const score = type === 'street'
                ? (weekly ? row.weeklyStreetPoints  : row.streetPoints)
                : type === 'circuit'
                    ? (weekly ? row.weeklyCircuitPoints : row.circuitPoints)
                    : (weekly ? row.weeklyPoints        : row.totalPoints);
            const medal = MEDALS[idx] || `${idx + 1}.`;
            return `${medal} **${row.displayName || row.discordId}** — ${Number(score || 0).toLocaleString()} pts`;
        });

        const label = TYPE_LABELS[type] || type;
        const embed = leaderboardEmbed({
            title:       `${label} Leaderboard${weekly ? ' · Weekly' : ''}`,
            description: DIVIDER + '\n' + lines.join('\n'),
            footer:      `Top ${data.length} drivers`,
        });

        await interaction.reply({
            embeds: [embed],
            components: rows([Buttons.refreshBoard(type)]),
        });
    },
};
