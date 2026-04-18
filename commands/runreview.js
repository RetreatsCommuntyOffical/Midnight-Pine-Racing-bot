const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
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
            await interaction.reply({ content: 'Staff only.', ephemeral: true });
            return;
        }

        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'pending') {
                const subs = await listPendingRunSubmissions(10);
                if (!subs.length) {
                    await interaction.reply({ content: '✅ No pending submissions.', ephemeral: true });
                    return;
                }
                const lines = subs.map((s) => {
                    const proofLink = s.proofUrl ? `[proof](${s.proofUrl})` : '';
                    const clipLink  = s.clipUrl  ? `[clip](${s.clipUrl})`   : '';
                    const links     = [proofLink, clipLink].filter(Boolean).join(' · ');
                    return `\`${s._id}\` <@${s.discordId}> — ${s.distanceMeters}m · ${s.topSpeed} mph · ${s.crashes} crash${s.crashes !== 1 ? 'es' : ''} · ${s.cleanRun ? 'clean' : 'not clean'} ${links ? `· ${links}` : ''}`;
                });
                await interaction.reply({ content: `**Pending runs (${subs.length}):**\n${lines.join('\n')}`, ephemeral: true });
                return;
            }

            const submissionId = interaction.options.getString('id', true);
            const approve      = sub === 'approve';
            const result       = await reviewRunSubmission({ submissionId, approve, reviewerDiscordId: interaction.user.id });

            await interaction.reply({
                content: approve
                    ? `✅ Run \`${result._id}\` approved for <@${result.discordId}>.`
                    : `🗑️ Run \`${result._id}\` rejected. Points rolled back for <@${result.discordId}>.`,
                ephemeral: true,
            });
        } catch (err) {
            const payload = { content: err.message || 'An error occurred.', ephemeral: true };
            if (interaction.deferred) await interaction.editReply(payload);
            else await interaction.reply(payload);
        }
    },
};
