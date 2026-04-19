'use strict';
const { warnEmbed, successEmbed, dangerEmbed, rows, Buttons, DIVIDER } = require('../core/ui/theme');
const { PermissionFlagsBits } = require('discord.js');
const { listPendingRunSubmissions, reviewRunSubmission } = require('../core/racing/service');

module.exports = {
    data: {
        name: 'runreview',
        description: 'Anti-cheat run review queue (staff only).',
        options: [
            { type: 1, name: 'pending', description: 'List pending run submissions.' },
            {
                type: 1, name: 'approve', description: 'Approve a run submission.',
                options: [{ type: 3, name: 'id', description: 'Submission ID.', required: true }],
            },
            {
                type: 1, name: 'reject', description: 'Reject a run submission (rolls back points).',
                options: [{ type: 3, name: 'id', description: 'Submission ID.', required: true }],
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
            if (sub === 'pending') {
                const subs = await listPendingRunSubmissions(10);
                if (!subs.length) {
                    await interaction.reply({
                        embeds: [successEmbed({ title: '\u2705 Queue Clear', description: 'No pending run submissions.' })],
                        flags: 64,
                    });
                    return;
                }
                const fields = subs.map((s) => {
                    const links = [s.proofUrl && `[proof](${s.proofUrl})`, s.clipUrl && `[clip](${s.clipUrl})`].filter(Boolean).join(' \u00b7 ');
                    return {
                        name:  `\`${s._id}\``,
                        value: `<@${s.discordId}> \u2014 ${s.distanceMeters}m \u00b7 ${s.topSpeed} mph \u00b7 ${s.crashes} crash${s.crashes !== 1 ? 'es' : ''} \u00b7 ${s.cleanRun ? '\u2705 clean' : '\u274c dirty'}${links ? ` \u00b7 ${links}` : ''}`,
                        inline: false,
                    };
                });
                const embed = warnEmbed({
                    title:       `\u23f3 Pending Runs (${subs.length})`,
                    description: DIVIDER,
                    fields,
                    footer:      'Use /runreview approve id:<id> or reject id:<id>',
                });
                await interaction.reply({ embeds: [embed], flags: 64 });
                return;
            }

            const submissionId = interaction.options.getString('id', true);
            const approve      = sub === 'approve';
            const result       = await reviewRunSubmission({ submissionId, approve, reviewerDiscordId: interaction.user.id });

            const embed = approve
                ? successEmbed({
                    title:       '\u2705 Run Approved',
                    description: `Run \`${result._id}\` verified for <@${result.discordId}>.`,
                })
                : dangerEmbed({
                    title:       '\uD83D\uDDD1\uFE0F Run Rejected',
                    description: `Run \`${result._id}\` rejected. Points rolled back for <@${result.discordId}>.`,
                });

            await interaction.reply({ embeds: [embed], flags: 64 });
        } catch (err) {
            const payload = { content: err.message || 'An error occurred.', flags: 64 };
            if (interaction.deferred) await interaction.editReply(payload);
            else await interaction.reply(payload);
        }
    },
};
