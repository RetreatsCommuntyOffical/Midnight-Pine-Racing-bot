'use strict';
/**
 * add-ticket-hub.js
 * Creates the 🎫 TICKET HUB category in Discord.
 *   • 📋┃ticket-panel  — public read-only, bot posts the ticket panel here
 *   • 📁┃ticket-logs   — staff-only, closed ticket transcripts
 * Individual ticket channels are created dynamically by the bot when users open tickets.
 * Safe to re-run.
 */

require('dotenv').config({ path: __dirname + '/.env' });
const { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType } = require('./node_modules/discord.js');

const STAFF_ROLES = ['👑 Admin', '🔧 Staff', '🛡️ Moderator', '🎙️ Host'];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
    const guild = client.guilds.cache.get(process.env.HOME_GUILD_ID);
    if (!guild) { console.error('Guild not found'); process.exit(1); }

    await guild.roles.fetch();
    await guild.channels.fetch();

    const staffRoles = STAFF_ROLES
        .map(n => guild.roles.cache.find(r => r.name === n))
        .filter(Boolean);

    // ── Category: 🎫 TICKET HUB ──────────────────────────────────────────────
    let cat = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name === '🎫 TICKET HUB'
    );
    if (!cat) {
        cat = await guild.channels.create({
            name: '🎫 TICKET HUB',
            type: ChannelType.GuildCategory,
        });
        console.log('+ category 🎫 TICKET HUB');
    } else {
        console.log('~ category 🎫 TICKET HUB already exists');
    }

    // ── ticket-panel: everyone can read, nobody can send (bot posts the panel) ──
    const panelOverwrites = [
        {
            id: guild.roles.everyone.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny:  [PermissionFlagsBits.SendMessages],
        },
        ...staffRoles.map(r => ({
            id: r.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        })),
    ];

    const panelExists = guild.channels.cache.find(c => c.name === '📋┃ticket-panel' && c.parentId === cat.id);
    if (!panelExists) {
        await guild.channels.create({
            name: '📋┃ticket-panel',
            type: ChannelType.GuildText,
            parent: cat.id,
            topic: 'Open a support ticket by clicking a button below.',
            permissionOverwrites: panelOverwrites,
        });
        console.log('  + 📋┃ticket-panel');
    } else {
        await panelExists.edit({ permissionOverwrites: panelOverwrites });
        console.log('  ~ 📋┃ticket-panel already exists — permissions refreshed');
    }

    // ── ticket-logs: staff-only archive of closed tickets ────────────────────
    const logsOverwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        ...staffRoles.map(r => ({
            id: r.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny:  [PermissionFlagsBits.SendMessages],
        })),
    ];

    const logsExists = guild.channels.cache.find(c => c.name === '📁┃ticket-logs' && c.parentId === cat.id);
    if (!logsExists) {
        await guild.channels.create({
            name: '📁┃ticket-logs',
            type: ChannelType.GuildText,
            parent: cat.id,
            topic: 'Closed ticket transcripts.',
            permissionOverwrites: logsOverwrites,
        });
        console.log('  + 📁┃ticket-logs');
    } else {
        await logsExists.edit({ permissionOverwrites: logsOverwrites });
        console.log('  ~ 📁┃ticket-logs already exists — permissions refreshed');
    }

    console.log('');
    console.log('✅ Ticket hub ready. Run /ticket setup in 📋┃ticket-panel to post the panel.');
    process.exit(0);
});

client.login(process.env.BOT_TOKEN);
