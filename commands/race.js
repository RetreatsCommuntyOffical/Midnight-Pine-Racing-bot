'use strict';
const { raceEmbed, successEmbed, leaderboardEmbed, rows, Buttons, DIVIDER, btn } = require('../core/ui/theme');
const { PermissionFlagsBits } = require('discord.js');
const { createRace, joinRace, startRace, submitRaceResults } = require('../core/racing/service');
const { refreshAllLeaderboards } = require('../core/racing/leaderboardPoster');

module.exports = {
    data: {
        name: 'race',
        description: 'Race management.',
        options: [
            {
                type: 1, name: 'create', description: 'Create a new race event.',
                options: [
                    { type: 3, name: 'name',  description: 'Race name.',  required: true },
                    { type: 3, name: 'track', description: 'Track name.', required: false },
                ],
            },
            {
                type: 1, name: 'join', description: 'Join an open race.',
                options: [{ type: 3, name: 'name', description: 'Race name to join.', required: true }],
            },
            {
                type: 1, name: 'start', description: 'Start a race (staff only).',
                options: [{ type: 3, name: 'name', description: 'Race name.', required: true }],
            },
            {
                type: 1, name: 'results', description: 'Submit race results (staff only).',
                options: [
                    { type: 3, name: 'name',    description: 'Race name.',                         required: true },
                    { type: 3, name: 'results', description: 'JSON array: [{"discordId":"...", "position":1}, ...]', required: true },
                ],
            },
        ],
    },

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'create') {
                const race = await createRace({
                    raceName:           interaction.options.getString('name', true),
                    trackName:          interaction.options.getString('track'),
                    createdByDiscordId: interaction.user.id,
                });
                const embed = raceEmbed({
                    title:       `🏁 Race Created — ${race.raceName}`,
                    description: race.trackName ? `Track: **${race.trackName}**` : 'No track specified.',
                    fields: [
                        { name: '👥 Drivers', value: '0 registered', inline: true },
                        { name: '🟡 Status',  value: 'Open',         inline: true },
                    ],
                });
                await interaction.reply({
                    embeds:     [embed],
                    components: rows([btn({ id: `race_join_${race.raceName}`, label: 'Join Race', style: 'Success', emoji: '🏁' })]),
                });
                return;
            }

            if (sub === 'join') {
                const race = await joinRace({ raceName: interaction.options.getString('name', true), discordId: interaction.user.id });
                const embed = successEmbed({
                    title:       `✅ Joined Race — ${race.raceName}`,
                    description: `You are registered. ${race.participants.length} driver(s) in.`,
                });
                await interaction.reply({ embeds: [embed] });
                return;
            }

            if (sub === 'start') {
                if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                    await interaction.reply({ content: 'Staff only.', flags: 64 });
                    return;
                }
                const race = await startRace({ raceName: interaction.options.getString('name', true) });
                const embed = raceEmbed({
                    title:       `🚦 Race Started — ${race.raceName}`,
                    description: `${race.participants.length} driver(s) on track. Good luck!`,
                });
                await interaction.reply({ embeds: [embed] });
                return;
            }

            if (sub === 'results') {
                if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                    await interaction.reply({ content: 'Staff only.', flags: 64 });
                    return;
                }
                await interaction.deferReply();

                let parsed;
                try {
                    parsed = JSON.parse(interaction.options.getString('results', true));
                } catch {
                    await interaction.editReply('Invalid results JSON. Format: `[{"discordId":"123","position":1}]`');
                    return;
                }

                const race = await submitRaceResults({
                    raceName:              interaction.options.getString('name', true),
                    results:               parsed,
                    submittedByDiscordId:  interaction.user.id,
                });

                const MEDALS = ['🥇', '🥈', '🥉'];
                const lines = race.results
                    .sort((a, b) => (a.dnf ? 1 : 0) - (b.dnf ? 1 : 0) || a.position - b.position)
                    .map((r, i) => {
                        const medal = r.dnf ? '🛑' : (MEDALS[i] || `**P${r.position}**`);
                        return `${medal} <@${r.discordId}>${r.dnf ? ' *(DNF)*' : ''} — ${r.pointsAwarded} pts`;
                    });

                const embed = raceEmbed({
                    title:       `🏁 Race Results — ${race.raceName}`,
                    description: DIVIDER,
                    fields: [
                        { name: '🏆 Results', value: lines.join('\n') || 'No results.', inline: false },
                    ],
                });

                await interaction.editReply({
                    embeds:     [embed],
                    components: rows([Buttons.refreshBoard('circuit'), Buttons.refreshBoard('street')]),
                });
                void refreshAllLeaderboards(interaction.client, interaction.guild);
            }
        } catch (err) {
            const payload = { content: err.message || 'An error occurred.', flags: 64 };
            if (interaction.deferred) await interaction.editReply(payload);
            else await interaction.reply(payload);
        }
    },
};
