'use strict';
const { teamEmbed, successEmbed, rows, Buttons, DIVIDER } = require('../core/ui/theme');
const { createTeam, joinTeam, getTeamStats, getTeamRank } = require('../core/racing/service');
const { postOrUpdateTeamRoster } = require('../core/racing/teamRosterPoster');

module.exports = {
    data: {
        name: 'team',
        description: 'Team management.',
        options: [
            {
                type: 1, name: 'create', description: 'Create a new team.',
                options: [{ type: 3, name: 'name', description: 'Team name.', required: true }],
            },
            {
                type: 1, name: 'join', description: 'Join an existing team.',
                options: [{ type: 3, name: 'name', description: 'Team name.', required: true }],
            },
            {
                type: 1, name: 'stats', description: 'View your team stats.',
                options: [{ type: 3, name: 'name', description: 'Team name (optional — defaults to your team).', required: false }],
            },
            {
                type: 1, name: 'roster', description: 'Refresh and show the team roster board.',
            },
        ],
    },

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'create') {
                const name = interaction.options.getString('name', true).trim();
                const team = await createTeam({ name, captainDiscordId: interaction.user.id });
                const embed = successEmbed({
                    title:       '🏗️ Team Created',
                    description: `**${team.name}** is ready. You are the captain.`,
                    fields: [
                        { name: '👥 Members', value: '1', inline: true },
                        { name: '🏆 Points',  value: '0', inline: true },
                    ],
                });
                await interaction.reply({
                    embeds:     [embed],
                    components: rows([Buttons.teamStatsByName(team.name), Buttons.applyToTeam()]),
                });
                await postOrUpdateTeamRoster(interaction.client, interaction.guild).catch(() => null);
                return;
            }

            if (sub === 'join') {
                const name = interaction.options.getString('name', true).trim();
                const team = await joinTeam({
                    name,
                    discordId:   interaction.user.id,
                    displayName: interaction.member?.displayName || interaction.user.username,
                });
                const embed = successEmbed({
                    title:       '✅ Joined Team',
                    description: `You are now a member of **${team.name}**.`,
                    fields: [
                        { name: '👥 Members', value: String(team.members.length), inline: true },
                    ],
                });
                await interaction.reply({
                    embeds:     [embed],
                    components: rows([Buttons.teamStatsByName(team.name)]),
                });
                await postOrUpdateTeamRoster(interaction.client, interaction.guild).catch(() => null);
                return;
            }

            if (sub === 'roster') {
                await interaction.deferReply({ flags: 64 });
                const msg = await postOrUpdateTeamRoster(interaction.client, interaction.guild);
                if (!msg) {
                    await interaction.editReply('Team roster channel not found. Expected channel: 📋┃team-roster');
                    return;
                }
                await interaction.editReply('✅ Team roster embed updated in 📋┃team-roster.');
                return;
            }

            if (sub === 'stats') {
                const DriverProfile = require('../models/DriverProfile');
                let teamName = interaction.options.getString('name');

                if (!teamName) {
                    const profile = await DriverProfile.findOne({ discordId: interaction.user.id }).populate('teamId');
                    if (!profile?.teamId) {
                        await interaction.reply({ content: "You're not in a team. Join one with `/team join`.", flags: 64 });
                        return;
                    }
                    teamName = profile.teamId.name;
                }

                const data = await getTeamStats(teamName);
                if (!data) { await interaction.reply({ content: 'Team not found.', flags: 64 }); return; }

                const { team, profiles } = data;
                const rank = await getTeamRank(team._id);
                const medals = ['🥇', '🥈', '🥉'];
                const memberLines = profiles.map((p, i) => `${medals[i] || `**${i + 1}.**`} ${p.displayName} — ${p.totalPoints} pts · ${p.tier}`);

                const embed = teamEmbed({
                    title:  `👥 Team: ${team.name}`,
                    description: DIVIDER,
                    fields: [
                        { name: '🏆 Total Points', value: String(team.totalPoints),       inline: true  },
                        { name: '🥇 Wins',         value: String(team.teamWins),          inline: true  },
                        { name: '📊 Rank',         value: `#${rank}`,                     inline: true  },
                        { name: `👤 Members (${profiles.length})`, value: memberLines.join('\n') || 'No members.', inline: false },
                    ],
                });

                await interaction.reply({
                    embeds:     [embed],
                    components: rows([Buttons.createTeam(), Buttons.applyToTeam(), Buttons.refreshBoard('team')]),
                });
            }
        } catch (err) {
            const payload = { content: err.message || 'An error occurred.', flags: 64 };
            if (interaction.deferred) await interaction.editReply(payload);
            else await interaction.reply(payload);
        }
    },
};
