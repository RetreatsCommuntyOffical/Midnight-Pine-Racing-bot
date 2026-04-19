'use strict';

const { getStation, getCurrentTrack } = require('../core/music/stationManager');
const { buildNowPlayingEmbed }        = require('../core/music/nowPlayingService');
const { getPrefs }                    = require('../core/music/playerPrefsService');

const STATION_CHOICES = [
    { name: '🌙 MIDNIGHT FM', value: 'midnight-fm' },
    { name: '🔥 DRIFT FM',    value: 'drift-fm'   },
    { name: '⚡ RUSH FM',     value: 'rush-fm'   },
];

module.exports = {
    data: {
        name: 'song',
        description: 'Get current song information.',
        options: [{
            type: 1,
            name: 'now',
            description: 'Show what\'s playing on your station (or a specific one).',
            options: [{
                type: 3, name: 'station',
                description: 'Station to check — defaults to your saved preference.',
                required: false, choices: STATION_CHOICES,
            }],
        }],
    },

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'now') {
                await interaction.deferReply({ flags: 64 });

                let slug = interaction.options.getString('station');
                if (!slug) {
                    const prefs = await getPrefs(interaction.user.id);
                    slug = prefs?.stationSlug || 'midnight-fm';
                }

                const station = await getStation(slug);
                if (!station) {
                    await interaction.editReply({ content: 'Station not found.' });
                    return;
                }

                const track = await getCurrentTrack(slug);
                const embed = buildNowPlayingEmbed(station, track);
                await interaction.editReply({ embeds: [embed] });
            }
        } catch (err) {
            const payload = { content: err.message || 'An error occurred.', flags: 64 };
            if (interaction.deferred) await interaction.editReply(payload);
            else await interaction.reply(payload);
        }
    },
};
