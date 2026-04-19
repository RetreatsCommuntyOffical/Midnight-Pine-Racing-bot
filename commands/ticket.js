'use strict';
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Ticket system management')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(sub => sub
            .setName('setup')
            .setDescription('Post the ticket panel in the current channel'))
        .addSubcommand(sub => sub
            .setName('close')
            .setDescription('Close this ticket channel'))
        .addSubcommand(sub => sub
            .setName('claim')
            .setDescription('Claim this ticket as your own')),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'setup') return setupPanel(interaction);
        if (sub === 'close') return closeTicket(interaction);
        if (sub === 'claim') return claimTicket(interaction);
    },
};

// ── /ticket setup ─────────────────────────────────────────────────────────────
async function setupPanel(interaction) {
    await interaction.deferReply({ flags: 64 });
    const { postSupportHubEmbed } = require('../core/ticketService');
    await postSupportHubEmbed(interaction.client, interaction.channelId);
    await interaction.editReply({ content: '✅ Support Hub panel posted.' });
}

// ── /ticket close ─────────────────────────────────────────────────────────────
async function closeTicket(interaction) {
    const { ticketService } = require('../core/ticketService');
    await ticketService.close(interaction);
}

// ── /ticket claim ─────────────────────────────────────────────────────────────
async function claimTicket(interaction) {
    const { ticketService } = require('../core/ticketService');
    await ticketService.claim(interaction);
}
