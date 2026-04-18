'use strict';
/**
 * add-dev-section.js
 * Adds the 💻 DEVELOPMENT category + channels, locked to Dev-access roles.
 * Roles with access: 👑 Admin, 🔧 Staff, 🛡️ Moderator, 🧪 Tester
 * Safe to re-run — skips anything already created.
 */

require('dotenv').config({ path: __dirname + '/.env' });
const { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType } = require('./node_modules/discord.js');

// Roles that can see the development section
const DEV_ACCESS_ROLES = [
    '👑 Admin',
    '🔧 Staff',
    '🛡️ Moderator',
    '🧪 Tester',
];

// Category and its channels
const DEV_SECTION = {
    category: '💻 DEVELOPMENT',
    channels: [
        '💻┃dev-general',       // open dev chat
        '🐛┃bug-reports',       // testers log bugs here
        '✅┃testing-log',        // what's been tested / QA notes
        '📋┃dev-updates',        // staff post internal dev progress
        '🔧┃bot-commands',       // bot testing sandbox
    ],
};

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
    const guild = client.guilds.cache.get(process.env.HOME_GUILD_ID);
    if (!guild) { console.error('Guild not found'); process.exit(1); }

    await guild.roles.fetch();
    await guild.channels.fetch();

    // Resolve dev-access roles
    const accessRoles = DEV_ACCESS_ROLES
        .map(name => guild.roles.cache.find(r => r.name === name))
        .filter(Boolean);

    if (accessRoles.length === 0) {
        console.error('None of the target roles were found — run role-order.js first.');
        process.exit(1);
    }

    console.log('Dev access roles found:', accessRoles.map(r => r.name).join(', '));

    // Permission overwrites: deny everyone, allow each dev role
    const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        ...accessRoles.map(r => ({
            id: r.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
            ],
        })),
    ];

    // Create or find category
    let cat = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name === DEV_SECTION.category
    );

    if (!cat) {
        cat = await guild.channels.create({
            name: DEV_SECTION.category,
            type: ChannelType.GuildCategory,
            permissionOverwrites: overwrites,
        });
        console.log(`+ category ${DEV_SECTION.category}`);
    } else {
        // Update perms on existing category in case roles changed
        await cat.edit({ permissionOverwrites: overwrites });
        console.log(`~ category ${DEV_SECTION.category} already exists — permissions refreshed`);
    }

    // Create channels
    let created = 0, skipped = 0;
    for (const chName of DEV_SECTION.channels) {
        const exists = guild.channels.cache.find(c => c.name === chName && c.parentId === cat.id);
        if (exists) {
            console.log(`  ~ ${chName} already exists`);
            skipped++;
            continue;
        }
        await guild.channels.create({
            name: chName,
            type: ChannelType.GuildText,
            parent: cat.id,
            permissionOverwrites: overwrites,
        });
        console.log(`  + ${chName}`);
        created++;
    }

    console.log('');
    console.log(`✅ DONE — category: ${cat.name} | +${created} channels created, ${skipped} skipped`);
    console.log('');
    console.log('Access granted to:');
    accessRoles.forEach(r => console.log(`  • ${r.name}`));
    process.exit(0);
});

client.login(process.env.BOT_TOKEN);
