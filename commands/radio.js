'use strict';

const { EmbedBuilder } = require('discord.js');
const { listStations, getStation, getCurrentTrack } = require('../core/music/stationManager');
const { buildAllStationsEmbed, buildNowPlayingEmbed } = require('../core/music/nowPlayingService');
const { getPrefs, savePrefs } = require('../core/music/playerPrefsService');

const STATION_CHOICES = [
    { name: '🌙 MIDNIGHT FM — Chill Night Drive', value: 'midnight-fm' },
    { name: '🔥 DRIFT FM — Phonk & Drift',        value: 'drift-fm'   },
    { name: '⚡ RUSH FM — High Energy',            value: 'rush-fm'   },
];

module.exports = {
    data: {
        name: 'radio',
        description: 'MIDNIGHT PINE RACING radio system.',
        options: [
            { type: 1, name: 'list', description: 'Show all available radio stations and what\'s playing.' },
            { type: 1, name: 'now',  description: 'Show current track across all stations.' },
            {
                type: 1,
                name: 'set-station',
                description: 'Tune to a radio station and save your preference.',
                options: [{
                    type: 3, name: 'station', description: 'Station to tune into.',
                    required: true, choices: STATION_CHOICES,
                }],
            },
            { type: 1, name: 'off', description: 'Turn off music for your session.' },
        ],
    },

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'list') {
                await interaction.deferReply();
                const embed = await buildAllStationsEmbed();
                await interaction.editReply({ embeds: [embed] });
                return;
            }

            if (sub === 'now') {
                await interaction.deferReply();
                const stations = await listStations();
                const embed = new EmbedBuilder()
                    .setColor(0x4a235a)
                    .setTitle('🎵 Now Playing — All Stations')
                    .setTimestamp()
                    .setFooter({ text: 'MIDNIGHT PINE RACING Radio' });

                for (const station of stations) {
                    const icon  = station.icon || '📻';
                    const track = await getCurrentTrack(station.slug);
                    embed.addFields({
                        name:  `${icon} ${station.name}`,
                        value: track
                            ? `**${track.trackTitle}** by ${track.trackArtist}`
                            : '_Nothing playing yet_',
                        inline: false,
                    });
                }
                await interaction.editReply({ embeds: [embed] });
                return;
            }

            if (sub === 'set-station') {
                const slug    = interaction.options.getString('station', true);
                const station = await getStation(slug);
                if (!station) {
                    await interaction.reply({ content: `Station \`${slug}\` not found.`, flags: 64 });
                    return;
                }
                await savePrefs(interaction.user.id, { stationSlug: slug, enabled: true });
                const track = await getCurrentTrack(slug);
                const embed = buildNowPlayingEmbed(station, track);
                const desc  = embed.data.description || '';
                embed.setDescription(`✅ Tuned into **${station.name}**\n\n${desc}`);
                await interaction.reply({ embeds: [embed], flags: 64 });
                return;
            }

            if (sub === 'off') {
                await savePrefs(interaction.user.id, { enabled: false });
                await interaction.reply({ content: '🔇 Music turned off. Use `/radio set-station` to turn it back on.', flags: 64 });
                return;
            }
        } catch (err) {
            const payload = { content: err.message || 'An error occurred.', flags: 64 };
            if (interaction.deferred) await interaction.editReply(payload);
            else await interaction.reply(payload);
        }
    },
};
