'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const {
    listStations, getStation, addTrack, removeTrack,
    setCurrentTrack, seedDefaultStations,
} = require('../core/music/stationManager');
const { postNowPlayingAnnouncement } = require('../core/music/nowPlayingService');

const STATION_CHOICES = [
    { name: '🌙 MIDNIGHT FM', value: 'midnight-fm' },
    { name: '🔥 DRIFT FM',    value: 'drift-fm'   },
    { name: '⚡ RUSH FM',     value: 'rush-fm'   },
];

module.exports = {
    data: {
        name: 'music-admin',
        description: 'Staff-only: manage radio stations, playlists, and now-playing.',
        options: [
            {
                type: 1, name: 'add-track',
                description: 'Add a track to a station playlist.',
                options: [
                    { type: 3, name: 'station',  description: 'Station',           required: true,  choices: STATION_CHOICES },
                    { type: 3, name: 'title',    description: 'Track title',        required: true  },
                    { type: 3, name: 'artist',   description: 'Artist name',        required: true  },
                    { type: 3, name: 'url',      description: 'Stream / audio URL', required: true  },
                    { type: 4, name: 'duration', description: 'Duration in seconds (optional)', required: false },
                ],
            },
            {
                type: 1, name: 'remove-track',
                description: 'Remove a track from a station by index.',
                options: [
                    { type: 3, name: 'station', description: 'Station',                        required: true, choices: STATION_CHOICES },
                    { type: 4, name: 'index',   description: 'Track index (0-based)',           required: true, min_value: 0 },
                ],
            },
            {
                type: 1, name: 'list-tracks',
                description: 'List all tracks on a station.',
                options: [
                    { type: 3, name: 'station', description: 'Station', required: true, choices: STATION_CHOICES },
                ],
            },
            {
                type: 1, name: 'set-now-playing',
                description: 'Manually set the current track shown for a station.',
                options: [
                    { type: 3, name: 'station', description: 'Station',      required: true,  choices: STATION_CHOICES },
                    { type: 3, name: 'title',   description: 'Track title',   required: true  },
                    { type: 3, name: 'artist',  description: 'Artist name',   required: true  },
                    { type: 3, name: 'url',     description: 'URL (optional)', required: false },
                ],
            },
            {
                type: 1, name: 'announce',
                description: 'Post a now-playing announcement for a station.',
                options: [
                    { type: 3, name: 'station', description: 'Station', required: true, choices: STATION_CHOICES },
                ],
            },
            { type: 1, name: 'reload', description: 'Re-seed default station data if missing.' },
        ],
    },

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({ content: 'Staff only.', flags: 64 });
            return;
        }

        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'add-track') {
                const slug     = interaction.options.getString('station', true);
                const title    = interaction.options.getString('title', true);
                const artist   = interaction.options.getString('artist', true);
                const url      = interaction.options.getString('url', true);
                const duration = interaction.options.getInteger('duration') || 0;

                const station = await addTrack(slug, {
                    title, artist, url, durationSec: duration,
                    addedBy: interaction.user.id,
                });
                await interaction.reply({
                    content: `✅ Added **${title}** by ${artist} to **${station.name}** (${station.tracks.length} total tracks).`,
                    flags: 64,
                });
                return;
            }

            if (sub === 'remove-track') {
                const slug    = interaction.options.getString('station', true);
                const index   = interaction.options.getInteger('index', true);
                const station = await removeTrack(slug, index);
                await interaction.reply({
                    content: `✅ Track at index **${index}** removed from **${station.name}** (${station.tracks.length} remaining).`,
                    flags: 64,
                });
                return;
            }

            if (sub === 'list-tracks') {
                const slug    = interaction.options.getString('station', true);
                const station = await getStation(slug);
                if (!station) {
                    await interaction.reply({ content: 'Station not found.', flags: 64 });
                    return;
                }
                const lines = station.tracks.length
                    ? station.tracks.map((t, i) => `\`${i}.\` **${t.title}** — ${t.artist} · ${t.durationSec}s${t.url ? '' : ' _(no URL)_'}`)
                    : ['_No tracks added yet._'];

                const embed = new EmbedBuilder()
                    .setColor(0x4a235a)
                    .setTitle(`📋 Playlist — ${station.name}`)
                    .setDescription(lines.join('\n').slice(0, 4000))
                    .setFooter({ text: `${station.tracks.length} track(s) · shuffle: ${station.shuffle}` })
                    .setTimestamp();
                await interaction.reply({ embeds: [embed], flags: 64 });
                return;
            }

            if (sub === 'set-now-playing') {
                const slug   = interaction.options.getString('station', true);
                const title  = interaction.options.getString('title', true);
                const artist = interaction.options.getString('artist', true);
                const url    = interaction.options.getString('url') || '';
                await setCurrentTrack(slug, { title, artist, url, requestedBy: interaction.user.id });
                await interaction.reply({
                    content: `✅ Now playing on **${slug}**: **${title}** by ${artist}`,
                    flags: 64,
                });
                return;
            }

            if (sub === 'announce') {
                const slug = interaction.options.getString('station', true);
                await interaction.deferReply({ flags: 64 });
                await postNowPlayingAnnouncement(interaction.client, slug);
                await interaction.editReply({ content: '✅ Now-playing announcement posted.' });
                return;
            }

            if (sub === 'reload') {
                await seedDefaultStations();
                const stations = await listStations();
                await interaction.reply({
                    content: `✅ Stations reloaded. **${stations.length}** station(s) active.`,
                    flags: 64,
                });
                return;
            }
        } catch (err) {
            const payload = { content: err.message || 'An error occurred.', flags: 64 };
            if (interaction.deferred) await interaction.editReply(payload);
            else await interaction.reply(payload);
        }
    },
};
