'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { embed: buildEmbed, COLORS, DIVIDER } = require('../core/ui/theme');

module.exports = {
    data: {
        name: 'roles',
        description: 'Post the self-assignable role picker (staff only).',
    },

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({ content: 'Staff only.', flags: 64 });
            return;
        }

        const roleEmbed = buildEmbed({
            color:       COLORS.primary,
            title:       '🚦 Self-Assignable Roles',
            description: [
                DIVIDER,
                '**🏎️ Street Driver** — No Hesi runs and street racing',
                '**🏁 Circuit Driver** — Track events and circuit races',
                '**🚦 Racer** — Compete in all formats',
                '',
                '**🎥 Content Creator** — Share your racing content',
                '**🤝 Partner** — Partner server member',
                DIVIDER,
                '_Click a button to add or remove a role. Toggle on/off anytime._',
            ].join('\n'),
        });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('role_street').setLabel('Street Driver').setEmoji('🏎️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('role_circuit').setLabel('Circuit Driver').setEmoji('🏁').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('role_racer').setLabel('Racer').setEmoji('🚦').setStyle(ButtonStyle.Success),
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('role_creator').setLabel('Content Creator').setEmoji('🎥').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('role_partner').setLabel('Partner').setEmoji('🤝').setStyle(ButtonStyle.Secondary),
        );

        await interaction.channel.send({ embeds: [roleEmbed], components: [row1, row2] });
        await interaction.reply({ content: '✅ Role picker posted.', flags: 64 });
    },
};
