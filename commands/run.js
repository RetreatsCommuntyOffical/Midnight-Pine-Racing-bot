'use strict';
const { runEmbed, successEmbed, warnEmbed, rows, Buttons, DIVIDER } = require('../core/ui/theme');
const { PermissionFlagsBits } = require('discord.js');
const { syncAutoRoles } = require('../core/racing/autoRoleService');
const { startRunSession, endRunSession, submitRun } = require('../core/racing/service');
const { postLeaderboardToChannel } = require('../core/racing/leaderboardPoster');

module.exports = {
    data: {
        name: 'run',
        description: 'Manage No Hesi run sessions.',
        options: [
            { type: 1, name: 'start', description: 'Start a No Hesi run session.' },
            { type: 1, name: 'end',   description: 'End your active run session.' },
            {
                type: 1,
                name: 'submit',
                description: 'Submit your run results.',
                options: [
                    { type: 10, name: 'distance_m',   description: 'Distance in meters.',      required: true },
                    { type: 4,  name: 'time_sec',      description: 'Time survived in seconds.', required: true },
                    { type: 10, name: 'top_speed',     description: 'Top speed reached.',        required: true },
                    { type: 4,  name: 'crashes',       description: 'Crash count.',              required: true, min_value: 0 },
                    { type: 5,  name: 'clean_run',     description: 'Was this a clean run?',     required: true },
                    { type: 3,  name: 'proof_url',     description: 'Screenshot URL.',           required: false },
                    { type: 3,  name: 'clip_url',      description: 'Video/clip URL.',           required: false },
                    { type: 5,  name: 'admin_verify',  description: 'Staff-only: verify this run now.', required: false },
                    { type: 3,  name: 'map_name',      description: 'Map name (e.g. Midnight Expressway).', required: false },
                    { type: 3,  name: 'vehicle',       description: 'Vehicle used (e.g. Nissan GT-R R35).', required: false },
                ],
            },
        ],
    },

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'start') {
                await startRunSession(interaction.user.id);
                const embed = runEmbed({
                    title:       '🌃 Run Session Started',
                    description: 'Hit the streets. Use `/run end` when done, then `/run submit`.',
                });
                await interaction.reply({ embeds: [embed] });
                return;
            }

            if (sub === 'end') {
                const session = await endRunSession(interaction.user.id);
                const dur = Math.round((session.endedAt - session.startedAt) / 1000);
                const embed = runEmbed({
                    title:       '🏁 Session Ended',
                    description: `Duration: **${dur}s**. Submit your results now.`,
                });
                await interaction.reply({ embeds: [embed] });
                return;
            }

            if (sub === 'submit') {
                const distanceMeters  = interaction.options.getNumber('distance_m', true);
                const timeSurvivedSec = interaction.options.getInteger('time_sec', true);
                const topSpeed        = interaction.options.getNumber('top_speed', true);
                const crashes         = interaction.options.getInteger('crashes', true);
                const cleanRun        = interaction.options.getBoolean('clean_run', true);
                const proofUrl        = interaction.options.getString('proof_url');
                const clipUrl         = interaction.options.getString('clip_url');
                const mapName         = interaction.options.getString('map_name');
                const vehicleName     = interaction.options.getString('vehicle');
                const adminVerifyFlag = interaction.options.getBoolean('admin_verify') || false;

                let adminVerifiedBy = null;
                if (adminVerifyFlag) {
                    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                        await interaction.reply({ content: 'Only staff can use admin_verify.', flags: 64 });
                        return;
                    }
                    adminVerifiedBy = interaction.user.id;
                }

                const { submission, points, progression, earnedCoins, suspiciousReasons } = await submitRun({
                    discordId:    interaction.user.id,
                    displayName:  interaction.member?.displayName || interaction.user.username,
                    distanceMeters, timeSurvivedSec, topSpeed, crashes, cleanRun,
                    proofUrl, clipUrl, adminVerifiedBy, mapName, vehicleName,
                });

                const acStatus = submission.antiCheatStatus === 'verified' ? '✅ Admin verified' : '⏳ Pending review';
                const embed = runEmbed({
                    title:       '🌃 No Hesi Submission',
                    description: `Run submitted for <@${interaction.user.id}>\n${DIVIDER}`,
                    fields: [
                        { name: '🏁 Points',      value: String(points.total),              inline: true },
                        { name: '⭐ XP Earned',   value: String(progression?.gained || 0),  inline: true },
                        { name: '🪙 Coins',       value: String(earnedCoins || 0),           inline: true },
                        { name: '📏 Distance',    value: `${distanceMeters} m`,              inline: true },
                        { name: '⏱️ Time',        value: `${timeSurvivedSec} s`,             inline: true },
                        { name: '💨 Top Speed',   value: String(topSpeed),                   inline: true },
                        { name: '💥 Crashes',     value: String(crashes),                    inline: true },
                        { name: '✅ Clean Run',   value: cleanRun ? 'Yes' : 'No',            inline: true },
                        ...(mapName     ? [{ name: '🗺️ Map',     value: mapName,     inline: true }] : []),
                        ...(vehicleName ? [{ name: '🚗 Vehicle', value: vehicleName, inline: true }] : []),
                        { name: '🔐 Anti-Cheat',  value: acStatus,                           inline: false },
                        ...(suspiciousReasons?.length
                            ? [{ name: '⚠️ Flags', value: suspiciousReasons.join(', '),      inline: false }]
                            : []),
                    ],
                });

                await interaction.reply({
                    embeds:     [embed],
                    components: rows([Buttons.viewStats(interaction.user.id), Buttons.runHistory(interaction.user.id)]),
                });
                // Fire-and-forget side effects
                syncAutoRoles(interaction.client, interaction.user.id).catch(() => null);
                (async () => {
                    await postLeaderboardToChannel(interaction.client, interaction.guild, 'street').catch(() => null);
                    await postLeaderboardToChannel(interaction.client, interaction.guild, 'solo').catch(() => null);
                })();
            }
        } catch (err) {
            const payload = { content: err.message || 'An error occurred.', flags: 64 };
            if (interaction.deferred) await interaction.editReply(payload);
            else await interaction.reply(payload);
        }
    },
};
