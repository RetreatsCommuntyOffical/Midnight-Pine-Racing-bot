const { PermissionFlagsBits } = require('discord.js');
const {
    adjustPlayerPoints,
    setLeaderboardBan,
    clearLeaderboardBan,
    resetWeeklyBoards,
    reloadTrafficRiskWeightsConfig,
    triggerTelemetryLeaderboardPost,
} = require('../core/admin/service');
const { bulkSyncAutoRoles } = require('../core/racing/autoRoleService');

module.exports = {
    data: {
        name: 'admin',
        description: 'Staff administration controls.',
        options: [
            {
                type: 1,
                name: 'add-points',
                description: 'Add or remove points from a player.',
                options: [
                    { type: 6, name: 'user', description: 'Target user', required: true },
                    { type: 4, name: 'delta', description: 'Positive or negative amount', required: true },
                    { type: 3, name: 'reason', description: 'Reason for adjustment', required: false },
                ],
            },
            {
                type: 1,
                name: 'ban-leaderboard',
                description: 'Ban user from leaderboards.',
                options: [
                    { type: 6, name: 'user', description: 'Target user', required: true },
                    { type: 3, name: 'reason', description: 'Reason', required: false },
                ],
            },
            {
                type: 1,
                name: 'unban-leaderboard',
                description: 'Remove leaderboard ban.',
                options: [
                    { type: 6, name: 'user', description: 'Target user', required: true },
                    { type: 3, name: 'reason', description: 'Reason', required: false },
                ],
            },
            {
                type: 1,
                name: 'reset-weekly',
                description: 'Reset weekly points and boards.',
                options: [
                    { type: 3, name: 'reason', description: 'Reason', required: false },
                ],
            },
            {
                type: 1,
                name: 'sync-roles',
                description: 'Re-sync all auto-assigned roles for every registered driver.',
            },
            {
                type: 1,
                name: 'reload-risk-weights',
                description: 'Reload traffic risk weights from environment without restart.',
                options: [
                    { type: 3, name: 'reason', description: 'Reason', required: false },
                ],
            },
            {
                type: 1,
                name: 'telemetry-post',
                description: 'Force post telemetry leaderboard to street board (supports dry run).',
                options: [
                    { type: 5, name: 'dry_run', description: 'Preview only, do not post.', required: false },
                    { type: 3, name: 'reason', description: 'Reason for audit log.', required: false },
                ],
            },
        ],
    },

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({ content: 'Staff only.', flags: 64 });
            return;
        }

        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'add-points') {
                const user = interaction.options.getUser('user', true);
                const delta = interaction.options.getInteger('delta', true);
                const reason = interaction.options.getString('reason') || '';
                const profile = await adjustPlayerPoints({
                    targetDiscordId: user.id,
                    deltaPoints: delta,
                    actorDiscordId: interaction.user.id,
                    reason,
                });
                const { successEmbed, dangerEmbed } = require('../core/ui/theme');
                const embed = (delta >= 0 ? successEmbed : dangerEmbed)({
                    title:       `${delta >= 0 ? '⬆️ Points Added' : '⬇️ Points Removed'}`,
                    description: `<@${user.id}>'s points updated.`,
                    fields: [
                        { name: 'Δ Delta',        value: `${delta > 0 ? '+' : ''}${delta}`, inline: true },
                        { name: '🏆 New Total',   value: String(profile.totalPoints),        inline: true },
                        { name: '📝 Reason',      value: reason || 'No reason given',        inline: false },
                    ],
                });
                await interaction.reply({ embeds: [embed] });
                return;
            }

            if (sub === 'ban-leaderboard') {
                const user   = interaction.options.getUser('user', true);
                const reason = interaction.options.getString('reason') || '';
                await setLeaderboardBan({
                    targetDiscordId: user.id,
                    actorDiscordId:  interaction.user.id,
                    reason,
                });
                const { dangerEmbed } = require('../core/ui/theme');
                const banEmbed = dangerEmbed({
                    title:       '🚫 Leaderboard Ban Applied',
                    description: `<@${user.id}> has been removed from all boards.`,
                    fields:      reason ? [{ name: '📝 Reason', value: reason, inline: false }] : [],
                });
                await interaction.reply({ embeds: [banEmbed] });
                return;
            }

            if (sub === 'unban-leaderboard') {
                const user = interaction.options.getUser('user', true);
                const reason = interaction.options.getString('reason') || '';
                const removed = await clearLeaderboardBan({
                    targetDiscordId: user.id,
                    actorDiscordId:  interaction.user.id,
                    reason,
                });
                const { successEmbed, warnEmbed } = require('../core/ui/theme');
                const unbanEmbed = removed
                    ? successEmbed({ title: '✅ Ban Removed', description: `<@${user.id}> can compete again.` })
                    : warnEmbed({ title: '⚠️ No Ban Found', description: `No active leaderboard ban for <@${user.id}>.` });
                await interaction.reply({ embeds: [unbanEmbed] });
                return;
            }

            if (sub === 'reset-weekly') {
                const reason = interaction.options.getString('reason') || 'manual reset';
                await resetWeeklyBoards({ actorDiscordId: interaction.user.id, reason });
                const { successEmbed } = require('../core/ui/theme');
                const resetEmbed = successEmbed({
                    title:       '✅ Weekly Boards Reset',
                    description: 'All weekly points cleared and audit logged.',
                    fields:      [{ name: '📝 Reason', value: reason, inline: false }],
                });
                await interaction.reply({ embeds: [resetEmbed] });
                return;
            }

            if (sub === 'sync-roles') {
                await interaction.deferReply({ flags: 64 });
                const { synced, skipped, errors } = await bulkSyncAutoRoles(interaction.client);
                const { successEmbed } = require('../core/ui/theme');
                const syncEmbed = successEmbed({
                    title:       '🔄 Auto-Role Sync Complete',
                    description: 'All registered driver profiles have been re-evaluated.',
                    fields: [
                        { name: '✅ Synced',   value: String(synced),  inline: true },
                        { name: '⏭️ Skipped', value: String(skipped), inline: true },
                        { name: '❌ Errors',  value: String(errors),  inline: true },
                    ],
                });
                await interaction.editReply({ embeds: [syncEmbed] });
                return;
            }

            if (sub === 'reload-risk-weights') {
                const reason = interaction.options.getString('reason') || 'manual reload';
                const weights = await reloadTrafficRiskWeightsConfig({
                    actorDiscordId: interaction.user.id,
                    reason,
                });

                const { successEmbed } = require('../core/ui/theme');
                const reloadEmbed = successEmbed({
                    title: '✅ Traffic Risk Weights Reloaded',
                    description: 'Runtime risk weighting has been refreshed from environment.',
                    fields: [
                        { name: 'Booking', value: String(weights.Booking), inline: true },
                        { name: 'Practice', value: String(weights.Practice), inline: true },
                        { name: 'Qualifying', value: String(weights.Qualifying), inline: true },
                        { name: 'Race', value: String(weights.Race), inline: true },
                        { name: 'Offline', value: String(weights.Offline), inline: true },
                        { name: 'Reason', value: reason, inline: false },
                    ],
                });

                await interaction.reply({ embeds: [reloadEmbed], flags: 64 });
                return;
            }

            if (sub === 'telemetry-post') {
                const dryRun = interaction.options.getBoolean('dry_run') || false;
                const reason = interaction.options.getString('reason') || 'manual telemetry post';
                const result = await triggerTelemetryLeaderboardPost({
                    actorDiscordId: interaction.user.id,
                    reason,
                    dryRun,
                });

                const { successEmbed, warnEmbed } = require('../core/ui/theme');
                const posted = !!result.posted;
                const embed = (posted ? successEmbed : warnEmbed)({
                    title: posted ? '✅ Telemetry Leaderboard Posted' : '🧪 Telemetry Post Check',
                    description: posted
                        ? 'Telemetry leaderboard was posted to street board.'
                        : 'Telemetry post request completed without sending a new embed.',
                    fields: [
                        { name: 'Posted', value: posted ? 'Yes' : 'No', inline: true },
                        { name: 'Dry Run', value: dryRun ? 'Yes' : 'No', inline: true },
                        { name: 'Reason', value: String(result.reason || 'none'), inline: true },
                        { name: 'Top Score', value: String(result.topScore || 0), inline: true },
                        { name: 'Rows', value: String(result.rowsPosted || 0), inline: true },
                        { name: 'Signature', value: String(result.signature || 'n/a').slice(0, 120), inline: false },
                    ],
                });

                await interaction.reply({ embeds: [embed], flags: 64 });
                return;
            }
        } catch (err) {
            await interaction.reply({ content: err.message || 'Admin action failed.', flags: 64 });
        }
    },
};
