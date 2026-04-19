const { ticketService, TICKET_TYPES } = require('./ticketService');
const { handleUiButton } = require('./ui/buttonHandlers');
const {
    buildApplyModal,
    buildCreateModal,
    handleApplySubmit,
    handleCreateSubmit,
    closeReviewChannel,
} = require('./teamHubService');

const ROLE_BUTTON_MAP = {
    role_street:  '🏎️ Street Driver',
    role_circuit: '🏁 Circuit Driver',
    role_racer:   '🚦 Racer',
    role_creator: '🎥 Content Creator',
    role_partner: '🤝 Partner',
};

function attachInteractionHandler(client, commands) {
    client.on('interactionCreate', async (interaction) => {

        // ── Slash commands ───────────────────────────────────────────────────
        if (interaction.isChatInputCommand()) {
            const command = commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (err) {
                console.error(`[${interaction.commandName}] error:`, err);
                const reply = { content: 'Something went wrong. Please try again.', flags: 64 };
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(reply).catch(() => null);
                } else {
                    await interaction.reply(reply).catch(() => null);
                }
            }
            return;
        }

        // ── Modal submissions ─────────────────────────────────────────────────
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'teamhub_apply_modal') {
                await handleApplySubmit(interaction).catch(err => {
                    console.error('[teamHub apply modal]', err);
                    interaction.editReply({ content: 'Failed to process application.' }).catch(() => null);
                });
                return;
            }
            if (interaction.customId === 'teamhub_create_modal') {
                await handleCreateSubmit(interaction).catch(err => {
                    console.error('[teamHub create modal]', err);
                    interaction.editReply({ content: 'Failed to process team creation request.' }).catch(() => null);
                });
                return;
            }
            return;
        }

        // ── Button interactions — ticket system ───────────────────────────────
        if (interaction.isButton()) {
            // UI theme buttons — handled first
            if (interaction.customId.startsWith('ui_')) {
                await handleUiButton(interaction).catch(err => {
                    console.error('[ui button]', err);
                    interaction.reply({ content: 'Action failed. Try again.', flags: 64 }).catch(() => null);
                });
                return;
            }

            // Open ticket
            if (interaction.customId in TICKET_TYPES) {
                await ticketService.open(interaction).catch(err => {
                    console.error('[ticket open]', err);
                    interaction.editReply({ content: 'Failed to open ticket.' }).catch(() => null);
                });
                return;
            }

            // Team Hub — Apply to Team
            if (interaction.customId === 'teamhub_apply') {
                await interaction.showModal(buildApplyModal()).catch(err => {
                    console.error('[teamHub apply button]', err);
                });
                return;
            }

            // Team Hub — Create Team
            if (interaction.customId === 'teamhub_create') {
                await interaction.showModal(buildCreateModal()).catch(err => {
                    console.error('[teamHub create button]', err);
                });
                return;
            }

            // Team Hub — Close review channel
            if (interaction.customId.startsWith('teamhub_review_close_')) {
                await closeReviewChannel(interaction).catch(err => {
                    console.error('[teamHub review close]', err);
                });
                return;
            }

            // Close ticket (from button inside ticket channel)
            if (interaction.customId.startsWith('ticket_close_')) {
                await ticketService.closeFromButton(interaction).catch(err => {
                    console.error('[ticket close]', err);
                });
                return;
            }

            // Claim ticket (from button inside ticket channel)
            if (interaction.customId.startsWith('ticket_claim_')) {
                await ticketService.claimFromButton(interaction).catch(err => {
                    console.error('[ticket claim]', err);
                });
                return;
            }

            // ── Division role toggle ─────────────────────────────────────────
            const roleName = ROLE_BUTTON_MAP[interaction.customId];
            if (!roleName) return;

            const role = interaction.guild?.roles.cache.find((r) => r.name === roleName);
            if (!role) {
                await interaction.reply({
                    content: `Role **${roleName}** not found. Run \`/setup-midnight-pine\` first.`,
                    flags: 64,
                });
                return;
            }

            const member = interaction.member;
            const has = member.roles.cache.has(role.id);

            try {
                if (has) {
                    await member.roles.remove(role);
                    await interaction.reply({ content: `🗑️ Removed **${roleName}**.`, flags: 64 });
                } else {
                    await member.roles.add(role);
                    await interaction.reply({ content: `✅ Granted **${roleName}**.`, flags: 64 });
                }
            } catch {
                await interaction.reply({
                    content: 'Failed to update role. Check bot permissions.',
                    flags: 64,
                });
            }
        }
    });
}

module.exports = { attachInteractionHandler };
