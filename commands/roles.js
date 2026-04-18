const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: {
        name: 'roles',
        description: 'Post the self-assignable role picker (staff only).',
    },

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({ content: 'Staff only.', ephemeral: true });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0x4a235a)
            .setTitle('🚦  Midnight Pine Racing — Self-Assignable Roles')
            .setDescription(
                '━━━━━━━━━━━━━━━━━━\n' +
                '**🏎️ Street Driver** — No Hesi runs and street racing\n' +
                '**🏁 Circuit Driver** — Track events and circuit races\n' +
                '**🚦 Racer** — Compete in all formats\n' +
                '\n' +
                '**🎥 Content Creator** — Share your racing content\n' +
                '**🤝 Partner** — Partner server member\n' +
                '━━━━━━━━━━━━━━━━━━\n' +
                '_Click to add or remove. Toggle on/off anytime._'
            );

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('role_street').setLabel('🏎️ Street Driver').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('role_circuit').setLabel('🏁 Circuit Driver').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('role_racer').setLabel('🚦 Racer').setStyle(ButtonStyle.Success),
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('role_creator').setLabel('🎥 Content Creator').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('role_partner').setLabel('🤝 Partner').setStyle(ButtonStyle.Secondary),
        );

        await interaction.channel.send({ embeds: [embed], components: [row1, row2] });
        await interaction.reply({ content: '✅ Role picker posted.', ephemeral: true });
    },
};
