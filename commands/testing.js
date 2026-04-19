const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const TESTER_ROLE_NAME = '🧪 Tester';

module.exports = {
    data: {
        name: 'testing',
        description: 'Manage early-access testing content (staff only).',
        options: [
            {
                type: 1, name: 'announce', description: 'Post early-access content to the testing channel.',
                options: [
                    { type: 3, name: 'title',            description: 'Map, vehicle, or feature name.',  required: true  },
                    { type: 3, name: 'description',       description: 'What testers should try.',        required: false },
                    { type: 3, name: 'image_url',         description: 'Preview image URL.',              required: false },
                    { type: 3, name: 'feedback_channel',  description: 'Channel name for feedback.',      required: false },
                    { type: 3, name: 'access_type',       description: 'e.g. Map, Vehicle, Feature.',     required: false },
                ],
            },
            {
                type: 1, name: 'assign', description: 'Grant or revoke the Tester role.',
                options: [
                    { type: 6, name: 'member', description: 'Discord member.', required: true },
                    { type: 5, name: 'grant',  description: 'true = grant, false = revoke.', required: true },
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
            if (sub === 'assign') {
                const member = interaction.options.getMember('member', true);
                const grant  = interaction.options.getBoolean('grant', true);
                const role   = interaction.guild?.roles.cache.find((r) => r.name === TESTER_ROLE_NAME);

                if (!role) {
                    await interaction.reply({ content: `**${TESTER_ROLE_NAME}** role not found. Run \`/setup-midnight-pine\` first.`, flags: 64 });
                    return;
                }

                if (grant) {
                    await member.roles.add(role);
                    await interaction.reply({ content: `✅ Granted **${TESTER_ROLE_NAME}** to ${member}.`, flags: 64 });
                } else {
                    await member.roles.remove(role);
                    await interaction.reply({ content: `🗑️ Revoked **${TESTER_ROLE_NAME}** from ${member}.`, flags: 64 });
                }
                return;
            }

            if (sub === 'announce') {
                const title          = interaction.options.getString('title', true);
                const description    = interaction.options.getString('description');
                const imageUrl       = interaction.options.getString('image_url');
                const feedbackCh     = interaction.options.getString('feedback_channel');
                const accessType     = interaction.options.getString('access_type') || 'Content';

                const channel = interaction.guild?.channels.cache.find((c) => c.name === '🧪┃testing-access' && c.isTextBased());
                if (!channel) {
                    await interaction.reply({ content: '`🧪┃testing-access` not found. Run `/setup-midnight-pine` first.', flags: 64 });
                    return;
                }

                const testerRole = interaction.guild?.roles.cache.find((r) => r.name === TESTER_ROLE_NAME);

                const embed = new EmbedBuilder()
                    .setColor(0x00b894)
                    .setTitle(`🧪  Early Access — ${title}`)
                    .setDescription([
                        `**${title}** is available for early testing.`,
                        '',
                        description || 'Push it to the limit and report what you find.',
                        '',
                        '━━━━━━━━━━━━━━━━━━',
                        `📂 **Type:** ${accessType}`,
                        feedbackCh ? `💬 **Feedback:** Post in ${feedbackCh}` : `💬 **Feedback:** Reply in <#${channel.id}>`,
                        '━━━━━━━━━━━━━━━━━━',
                        '_Only Testers can see this channel._',
                    ].join('\n'))
                    .setTimestamp()
                    .setFooter({ text: 'Midnight Pine Racing · Testing Program' });

                if (imageUrl) embed.setImage(imageUrl);

                await channel.send({ content: testerRole ? `<@&${testerRole.id}>` : null, embeds: [embed] });
                await interaction.reply({ content: `✅ Testing announcement posted in <#${channel.id}>.`, flags: 64 });
            }
        } catch (err) {
            const payload = { content: err.message || 'An error occurred.', flags: 64 };
            if (interaction.deferred) await interaction.editReply(payload);
            else await interaction.reply(payload);
        }
    },
};
