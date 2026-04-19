const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { archiveSeason, getSeasonHistory } = require('../core/racing/seasonService');

module.exports = {
    data: {
        name: 'season',
        description: 'Seasonal championship management (admin only).',
        options: [
            {
                type: 1, name: 'end', description: 'Archive current season and reset all points.',
                options: [{ type: 3, name: 'tag', description: 'Season tag, e.g. S1 or 2026-Spring.', required: true }],
            },
            { type: 1, name: 'history', description: 'View past season archives.' },
        ],
    },

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator only.', flags: 64 });
            return;
        }

        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'end') {
                await interaction.deferReply({ flags: 64 });
                const tag     = interaction.options.getString('tag', true);
                const archive = await archiveSeason(tag);

                const lines = [
                    `✅ **Season ${tag} archived.**`,
                    `🏆 Solo Champion:    ${archive.soloChampion    ? `<@${archive.soloChampion}>`    : 'N/A'}`,
                    `🏙️ Street Champion:  ${archive.streetChampion  ? `<@${archive.streetChampion}>`  : 'N/A'}`,
                    `🏁 Circuit Champion: ${archive.circuitChampion ? `<@${archive.circuitChampion}>` : 'N/A'}`,
                    `👥 Team Champion:    ${archive.teamChampion    || 'N/A'}`,
                    ``,
                    `All season points reset. New season is live.`,
                ];
                await interaction.editReply(lines.join('\n'));
                return;
            }

            if (sub === 'history') {
                const archives = await getSeasonHistory(5);
                if (!archives.length) {
                    await interaction.reply({ content: 'No past seasons recorded yet.', flags: 64 });
                    return;
                }

                const embed = new EmbedBuilder()
                    .setColor(0xfdcb6e)
                    .setTitle('🏆  Season History — Midnight Pine Racing');

                for (const a of archives) {
                    const ts = Math.floor(new Date(a.archivedAt).getTime() / 1000);
                    embed.addFields({
                        name: `Season ${a.seasonTag} — <t:${ts}:D>`,
                        value: [
                            `🏆 Solo: ${a.soloChampion    ? `<@${a.soloChampion}>`    : 'N/A'}`,
                            `🏙️ Street: ${a.streetChampion  ? `<@${a.streetChampion}>`  : 'N/A'}`,
                            `🏁 Circuit: ${a.circuitChampion ? `<@${a.circuitChampion}>` : 'N/A'}`,
                            `👥 Team: ${a.teamChampion || 'N/A'}`,
                        ].join(' · '),
                        inline: false,
                    });
                }

                await interaction.reply({ embeds: [embed] });
            }
        } catch (err) {
            const payload = { content: err.message || 'An error occurred.', flags: 64 };
            if (interaction.deferred) await interaction.editReply(payload);
            else await interaction.reply(payload);
        }
    },
};
