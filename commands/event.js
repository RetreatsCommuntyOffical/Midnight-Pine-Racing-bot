'use strict';
const { eventEmbed, rows, Buttons, ts, DIVIDER } = require('../core/ui/theme');
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
                    await interaction.reply({ content: 'Staff only.', flags: 64 });
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

                const embed = eventEmbed({
                    title:       `🏁 Event Scheduled — ${evt.title}`,
                    description: evt.description || 'Get ready to race.',
                    fields: [
                        { name: '🗓️ Starts',    value: ts(evt.startsAt, 'F'),    inline: true },
                        { name: '⏰ Countdown', value: ts(evt.startsAt, 'R'),    inline: true },
                        { name: '🔔 Reminders', value: '60, 15 & 5 min before', inline: true },
                    ],
                });
                await interaction.reply({ embeds: [embed], components: rows([Buttons.joinEvent(evt.title)]) });
                return;
            }

            if (sub === 'list') {
                const events = await listScheduledEvents(10);
                if (!events.length) {
                    await interaction.reply({
                        embeds: [eventEmbed({ title: '🗓️ No Upcoming Events', description: 'Nothing scheduled yet. Check back soon!' })],
                    });
                    return;
                }
                const fields = events.map((e) => ({
                    name:  `🏁 ${e.title}`,
                    value: `Starts ${ts(e.startsAt, 'F')} · ${ts(e.startsAt, 'R')}${e.description ? `\n${e.description}` : ''}`,
                    inline: false,
                }));
                const embed = eventEmbed({
                    title:       '🗓️ Upcoming Events',
                    description: DIVIDER,
                    fields,
                    footer:      `${events.length} event${events.length !== 1 ? 's' : ''} scheduled`,
                });
                const firstEvt = events[0];
                await interaction.reply({ embeds: [embed], components: rows([Buttons.joinEvent(firstEvt.title)]) });
            }
        } catch (err) {
            const payload = { content: err.message || 'An error occurred.', flags: 64 };
            if (interaction.deferred) await interaction.editReply(payload);
            else await interaction.reply(payload);
        }
    },
};
