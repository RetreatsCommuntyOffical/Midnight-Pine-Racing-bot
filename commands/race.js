const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
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
                await interaction.reply(`🏁 Race **${race.raceName}** created${race.trackName ? ` on **${race.trackName}**` : ''}. Players can use \`/race join name:${race.raceName}\`.`);
                return;
            }

            if (sub === 'join') {
                const race = await joinRace({ raceName: interaction.options.getString('name', true), discordId: interaction.user.id });
                await interaction.reply(`✅ You've joined **${race.raceName}**. ${race.participants.length} driver(s) registered.`);
                return;
            }

            if (sub === 'start') {
                if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                    await interaction.reply({ content: 'Staff only.', ephemeral: true });
                    return;
                }
                const race = await startRace({ raceName: interaction.options.getString('name', true) });
                await interaction.reply(`🚦 **${race.raceName}** is now **started**. ${race.participants.length} driver(s) in.`);
                return;
            }

            if (sub === 'results') {
                if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                    await interaction.reply({ content: 'Staff only.', ephemeral: true });
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

                const lines = race.results
                    .sort((a, b) => (a.dnf ? 1 : 0) - (b.dnf ? 1 : 0) || a.position - b.position)
                    .map((r) => `**P${r.position}** <@${r.discordId}>${r.dnf ? ' *(DNF)*' : ''} — ${r.pointsAwarded} pts`);

                const embed = new EmbedBuilder()
                    .setColor(0x0a3d62)
                    .setTitle(`🏁 Race Results — ${race.raceName}`)
                    .setDescription(lines.join('\n') || 'No results.')
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                void refreshAllLeaderboards(interaction.client, interaction.guild);
            }
        } catch (err) {
            const payload = { content: err.message || 'An error occurred.', ephemeral: true };
            if (interaction.deferred) await interaction.editReply(payload);
            else await interaction.reply(payload);
        }
    },
};
