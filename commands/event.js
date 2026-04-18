const { PermissionFlagsBits } = require('discord.js');
const { createScheduledEvent, listScheduledEvents } = require('../core/racing/service');

module.exports = {
    data: {
        name: 'event',
        description: 'Manage scheduled race events.',
        options: [
            {
                type: 1, name: 'create', description: 'Schedule a new race event.',
                options: [
                    { type: 3, name: 'title',        description: 'Event title.',                     required: true  },
                    { type: 3, name: 'starts_at',    description: 'ISO start time (e.g. 2026-04-20T22:00:00Z).', required: true },
                    { type: 3, name: 'description',  description: 'Event description.',               required: false },
                    { type: 8, name: 'ping_role',    description: 'Role to ping for reminders.',      required: false },
                    { type: 7, name: 'channel',      description: 'Channel for reminders.',           required: false },
                ],
            },
            { type: 1, name: 'list', description: 'List upcoming scheduled events.' },
        ],
    },

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'create') {
                if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                    await interaction.reply({ content: 'Staff only.', ephemeral: true });
                    return;
                }
                const evt = await createScheduledEvent({
                    title:              interaction.options.getString('title', true),
                    startsAt:           interaction.options.getString('starts_at', true),
                    description:        interaction.options.getString('description'),
                    targetRoleId:       interaction.options.getRole('ping_role')?.id    || null,
                    channelId:          interaction.options.getChannel('channel')?.id   || null,
                    createdByDiscordId: interaction.user.id,
                });
                const ts = Math.floor(new Date(evt.startsAt).getTime() / 1000);
                await interaction.reply(`📅 Event **${evt.title}** scheduled for <t:${ts}:F> (<t:${ts}:R>). Reminders at 60, 15 & 5 minutes.`);
                return;
            }

            if (sub === 'list') {
                const events = await listScheduledEvents(10);
                if (!events.length) {
                    await interaction.reply('No upcoming events scheduled.');
                    return;
                }
                const lines = events.map((e) => {
                    const ts = Math.floor(new Date(e.startsAt).getTime() / 1000);
                    return `• **${e.title}** — <t:${ts}:F> (<t:${ts}:R>)`;
                });
                await interaction.reply(lines.join('\n'));
            }
        } catch (err) {
            const payload = { content: err.message || 'An error occurred.', ephemeral: true };
            if (interaction.deferred) await interaction.editReply(payload);
            else await interaction.reply(payload);
        }
    },
};
