const { EmbedBuilder } = require('discord.js');
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
            await interaction.editReply(`Team **${name}** not found.`);
            return;
        }

        const { team, profiles } = data;
        const rank = await getTeamRank(team._id);

        const memberLines = profiles.map((p, i) => {
            const pos = ['🥇','🥈','🥉'][i] || `**${i + 1}.**`;
            return `${pos} ${p.displayName} — ${p.totalPoints} pts · ${p.tier}`;
        });

        const embed = new EmbedBuilder()
            .setColor(0x00b894)
            .setTitle(`👥 Team Stats — ${team.name}`)
            .addFields(
                { name: '🏆 Total Points', value: String(team.totalPoints), inline: true },
                { name: '🥇 Team Wins',    value: String(team.teamWins),    inline: true },
                { name: '📊 Rank',         value: `#${rank}`,              inline: true },
                { name: '📅 Weekly Pts',   value: String(team.weeklyPoints || 0), inline: true },
                { name: `👤 Roster (${profiles.length})`, value: memberLines.join('\n') || 'No members.', inline: false }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
