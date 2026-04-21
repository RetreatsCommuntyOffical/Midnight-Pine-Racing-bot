'use strict';
const { teamEmbed, rows, Buttons, DIVIDER } = require('../core/ui/theme');
const { getTeamStats, getTeamRank } = require('../core/racing/service');

module.exports = {
    data: {
        name: 'teamstats',
        description: 'View detailed stats for any team.',
        options: [
            { type: 3, name: 'team', description: 'Team name to look up.', required: true },
        ],
    },

    async execute(interaction) {
        const name = interaction.options.getString('team', true);
        await interaction.deferReply();

        const data = await getTeamStats(name);
        if (!data) {
            await interaction.editReply({ content: `Team **${name}** not found.` });
            return;
        }

        const { team, profiles } = data;
        const rank = await getTeamRank(team._id);
        const medals = ['🥇', '🥈', '🥉'];
        const memberLines = profiles.map((p, i) =>
            `${medals[i] || `**${i + 1}.**`} ${p.displayName} — ${p.totalPoints} pts · ${p.tier}`
        );

        const embed = teamEmbed({
            title:       `👥 Team Stats — ${team.name}`,
            description: DIVIDER,
            thumbnail:   team.iconUrl   || undefined,
            image:       team.bannerUrl || undefined,
            fields: [
                { name: '🏆 Total Points', value: String(team.totalPoints),          inline: true  },
                { name: '🥇 Team Wins',    value: String(team.teamWins),             inline: true  },
                { name: '📊 Rank',         value: `#${rank}`,                        inline: true  },
                { name: '📅 Weekly Pts',   value: String(team.weeklyPoints || 0),    inline: true  },
                { name: `👤 Roster (${profiles.length})`, value: memberLines.join('\n') || 'No members.', inline: false },
            ],
        });

        await interaction.editReply({
            embeds:     [embed],
            components: rows([Buttons.createTeam(), Buttons.applyToTeam()]),
        });
    },
};
