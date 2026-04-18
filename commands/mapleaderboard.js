const { EmbedBuilder } = require('discord.js');
const { getMapLeaderboard, getMapIndex, getVehicleLeaderboard } = require('../core/racing/service');
const DriverProfile = require('../models/DriverProfile');

const DIVIDER = '━━━━━━━━━━━━━━━━━━';

module.exports = {
    data: {
        name: 'mapleaderboard',
        description: 'Top speeds on maps or vehicle performance rankings.',
        options: [
            {
                type: 1, name: 'speeds', description: 'Top speeds on a specific map.',
                options: [
                    { type: 3, name: 'map',   description: 'Map name.',                             required: true  },
                    { type: 4, name: 'limit', description: 'Entries to show (max 25).',             required: false, min_value: 1, max_value: 25 },
                ],
            },
            { type: 1, name: 'maps', description: 'List all maps with run data.' },
            {
                type: 1, name: 'vehicles', description: 'Vehicle performance rankings.',
                options: [
                    { type: 3, name: 'vehicle', description: 'Filter by specific vehicle.',         required: false },
                    { type: 4, name: 'limit',   description: 'Entries to show (max 25).',           required: false, min_value: 1, max_value: 25 },
                ],
            },
        ],
    },

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'maps') {
                const maps = await getMapIndex();
                if (!maps.length) {
                    await interaction.reply({ content: 'No map data yet. Submit runs with `/run submit map_name:...`.', ephemeral: true });
                    return;
                }
                const embed = new EmbedBuilder()
                    .setColor(0x4a235a)
                    .setTitle('🗺️  Midnight Pine Racing — Tracked Maps')
                    .setDescription(maps.map((m, i) => `**${i + 1}.** ${m}`).join('\n'))
                    .setFooter({ text: 'Use /mapleaderboard speeds map:<name> for top times' })
                    .setTimestamp();
                await interaction.reply({ embeds: [embed] });
                return;
            }

            if (sub === 'speeds') {
                const rawMap = interaction.options.getString('map', true);
                const limit  = interaction.options.getInteger('limit') || 10;
                const allMaps = await getMapIndex();
                const matched = allMaps.find((m) => m?.toLowerCase().includes(rawMap.toLowerCase())) || rawMap;
                const rows = await getMapLeaderboard(matched, limit);

                if (!rows.length) {
                    await interaction.reply({ content: `No verified runs on **${matched}** yet.`, ephemeral: true });
                    return;
                }

                const profiles = await DriverProfile.find({ discordId: { $in: rows.map((r) => r._id) } });
                const nameMap  = Object.fromEntries(profiles.map((p) => [p.discordId, p.displayName]));

                const lines = rows.map((row, i) => {
                    const medal = ['🥇','🥈','🥉'][i] || `**${i + 1}.**`;
                    const name  = nameMap[row._id] || `<@${row._id}>`;
                    return `${medal} ${name} — **${row.topSpeed} mph** | ${Math.round(row.distanceMeters ?? 0)} m`;
                });

                const embed = new EmbedBuilder()
                    .setColor(0x4a235a)
                    .setTitle(`🏁  Top Speeds — ${matched}`)
                    .setDescription(`${DIVIDER}\n${lines.join('\n')}\n${DIVIDER}`)
                    .setFooter({ text: 'Personal bests only · pending runs excluded' })
                    .setTimestamp();
                await interaction.reply({ embeds: [embed] });
                return;
            }

            if (sub === 'vehicles') {
                const vehicleFilter = interaction.options.getString('vehicle');
                const limit         = interaction.options.getInteger('limit') || 10;
                const rows          = await getVehicleLeaderboard(limit, vehicleFilter || undefined);

                if (!rows.length) {
                    await interaction.reply({ content: 'No vehicle data yet. Submit runs with `/run submit vehicle:...`.', ephemeral: true });
                    return;
                }

                let lines;
                if (vehicleFilter) {
                    const profiles = await DriverProfile.find({ discordId: { $in: rows.map((r) => r._id) } });
                    const nameMap  = Object.fromEntries(profiles.map((p) => [p.discordId, p.displayName]));
                    lines = rows.map((row, i) => {
                        const medal = ['🥇','🥈','🥉'][i] || `**${i + 1}.**`;
                        return `${medal} ${nameMap[row._id] || `<@${row._id}>`} — **${row.topSpeed} mph** (${row.runs} run${row.runs !== 1 ? 's' : ''})`;
                    });
                } else {
                    lines = rows.map((row, i) => {
                        const medal = ['🥇','🥈','🥉'][i] || `**${i + 1}.**`;
                        return `${medal} **${row._id}** — ${row.topSpeed} mph · ${row.runs} run${row.runs !== 1 ? 's' : ''}`;
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor(0x0a3d62)
                    .setTitle(vehicleFilter ? `🚗  Top Drivers — ${vehicleFilter}` : '🚗  Vehicle Performance Rankings')
                    .setDescription(`${DIVIDER}\n${lines.join('\n')}\n${DIVIDER}`)
                    .setTimestamp();
                await interaction.reply({ embeds: [embed] });
            }
        } catch (err) {
            const payload = { content: err.message || 'An error occurred.', ephemeral: true };
            if (interaction.deferred) await interaction.editReply(payload);
            else await interaction.reply(payload);
        }
    },
};
