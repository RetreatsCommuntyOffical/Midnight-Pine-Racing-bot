const { PermissionFlagsBits, ChannelType, OverwriteType } = require('discord.js');

const ROLES = [
    // ── Staff hierarchy ──────────────────────────────────────────────────────
    { name: '👑 Admin',             color: 0xfdcb6e, hoist: true,  position: 1  },
    { name: '🔧 Staff',             color: 0xd63031, hoist: true,  position: 2  },
    { name: '🛡️ Moderator',         color: 0xff7675, hoist: true,  position: 3  },
    { name: '🎙️ Host',              color: 0xe17055, hoist: true,  position: 4  },

    // ── Ranked tiers (auto-assigned by bot) ──────────────────────────────────
    { name: '🏆 Champion',          color: 0xf1c40f, hoist: true,  position: 5  },
    { name: '⚡ Elite',              color: 0xe74c3c, hoist: true,  position: 6  },
    { name: '🔵 Pro',               color: 0x3498db, hoist: true,  position: 7  },
    { name: '🟢 Rookie',            color: 0x2ecc71, hoist: false, position: 8  },

    // ── Milestone / achievement roles (staff-assigned) ────────────────────────
    { name: '💎 Season MVP',        color: 0xa29bfe, hoist: false, position: 9  },
    { name: '🔥 Top Speed King',    color: 0xff6b6b, hoist: false, position: 10 },
    { name: '💯 Clean Driver',      color: 0x00cec9, hoist: false, position: 11 },
    { name: '🌟 Veteran',           color: 0xffeaa7, hoist: false, position: 12 },
    { name: '⚡ Streak Champion',   color: 0xdfe6e9, hoist: false, position: 13 },

    // ── Division roles (self-assigned via /roles post) ────────────────────────
    { name: '🏎️ Street Driver',     color: 0x9b59b6, hoist: false, position: 14 },
    { name: '🏁 Circuit Driver',    color: 0x1abc9c, hoist: false, position: 15 },
    { name: '🚦 Racer',             color: 0xe67e22, hoist: false, position: 16 },

    // ── Program roles ─────────────────────────────────────────────────────────
    { name: '🧪 Tester',            color: 0x55efc4, hoist: false, position: 17 },
    { name: '🎥 Content Creator',   color: 0xfd79a8, hoist: false, position: 18 },
    { name: '🤝 Partner',           color: 0x74b9ff, hoist: false, position: 19 },
];

const STRUCTURE = [
    {
        category: '📋 INFORMATION',
        channels: [
            { name: '📋┃rules',          topic: 'Server rules. Read before racing.' },
            { name: '📢┃announcements',  topic: 'Official Midnight Pine Racing announcements.' },
            { name: '🏁┃welcome',        topic: 'Welcome to Midnight Pine Racing.' },
        ],
    },
    {
        category: '🗺️ MIDNIGHT RELEASES',
        channels: [
            { name: '🗺️┃map-releases',   topic: 'Official map drops. /release map' },
            { name: '🚗┃vehicle-releases', topic: 'Official vehicle drops. /release vehicle' },
            { name: '📦┃update-log',      topic: 'Patch notes and updates. /release update' },
            { name: '🔥┃sneak-peeks',     topic: 'Hype teasers before big drops. /release sneak' },
            { name: '🧪┃testing-access',  topic: 'Early access for Testers.' },
        ],
    },
    {
        category: '🏁 RACE CONTROL',
        channels: [
            { name: '🏁┃race-lobby',     topic: 'Join and manage races. /race create|join|start|results' },
            { name: '📊┃race-results',   topic: 'Automated race results.' },
            { name: '🚦┃run-submissions', topic: 'No Hesi run submissions. /run submit' },
        ],
        staffOnly: false,
    },
    {
        category: '📊 LEADERBOARDS',
        channels: [
            { name: '🏆┃solo-board',    topic: 'Auto-updated solo leaderboard.' },
            { name: '🏙️┃street-board',  topic: 'Auto-updated street leaderboard.' },
            { name: '🏁┃circuit-board', topic: 'Auto-updated circuit leaderboard.' },
            { name: '👥┃team-board',    topic: 'Auto-updated team leaderboard.' },
        ],
    },
    {
        category: '👥 TEAMS',
        channels: [
            { name: '👥┃team-hub',    topic: 'Create and manage teams. /team create|join|stats' },
            { name: '📋┃team-roster', topic: 'View team rosters.' },
        ],
    },
    {
        category: '📅 EVENTS',
        channels: [
            { name: '📅┃events',       topic: 'Upcoming events. /event list' },
            { name: '🔔┃event-alerts', topic: 'Automated event reminders.' },
        ],
    },
    {
        category: '💬 COMMUNITY',
        channels: [
            { name: '💬┃general',   topic: 'General racing chat.' },
            { name: '🎙️┃media',     topic: 'Share clips and screenshots.' },
            { name: '💡┃suggestions', topic: 'Suggest new content.' },
        ],
    },
    {
        category: '🔧 STAFF ROOM',
        staffOnly: true,
        channels: [
            { name: '🔧┃staff-chat', topic: 'Staff-only discussion.' },
            { name: '📋┃run-review', topic: 'Anti-cheat review queue. /runreview' },
            { name: '📊┃bot-logs',   topic: 'Bot operational logs.' },
        ],
    },
];

module.exports = {
    data: {
        name: 'setup-midnight-pine',
        description: 'Auto-create all Midnight Pine Racing roles, channels, and categories.',
        defaultMemberPermissions: String(PermissionFlagsBits.Administrator),
    },

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const results = { roles: [], categories: [], channels: [], skipped: [] };

        // ── Roles ────────────────────────────────────────────────────────────
        for (const roleDef of ROLES) {
            const existing = guild.roles.cache.find((r) => r.name === roleDef.name);
            if (existing) {
                results.skipped.push(`Role: ${roleDef.name}`);
            } else {
                await guild.roles.create({ name: roleDef.name, color: roleDef.color, hoist: roleDef.hoist });
                results.roles.push(roleDef.name);
            }
        }

        // Refresh role cache
        await guild.roles.fetch();

        const adminRole = guild.roles.cache.find((r) => r.name === '👑 Admin');
        const staffRole = guild.roles.cache.find((r) => r.name === '🔧 Staff');
        const modRole   = guild.roles.cache.find((r) => r.name === '🛡️ Moderator');
        const hostRole  = guild.roles.cache.find((r) => r.name === '🎙️ Host');

        const staffRoles = [adminRole, staffRole, modRole, hostRole].filter(Boolean);

        // ── Categories + Channels ────────────────────────────────────────────
        for (const section of STRUCTURE) {
            let category = guild.channels.cache.find(
                (c) => c.type === ChannelType.GuildCategory && c.name === section.category
            );

            if (!category) {
                const permissionOverwrites = section.staffOnly
                    ? [
                        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                        ...staffRoles.map((r) => ({ id: r.id, allow: [PermissionFlagsBits.ViewChannel] })),
                    ]
                    : [];
                category = await guild.channels.create({
                    name: section.category,
                    type: ChannelType.GuildCategory,
                    permissionOverwrites,
                });
                results.categories.push(section.category);
            } else {
                results.skipped.push(`Category: ${section.category}`);
            }

            for (const ch of section.channels) {
                const exists = guild.channels.cache.find((c) => c.name === ch.name && c.isTextBased());
                if (exists) {
                    results.skipped.push(`Channel: ${ch.name}`);
                    continue;
                }

                const permissionOverwrites = ch.staffOnly === true || section.staffOnly
                    ? [
                        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                        ...staffRoles.map((r) => ({ id: r.id, allow: [PermissionFlagsBits.ViewChannel] })),
                    ]
                    : [];

                await guild.channels.create({
                    name: ch.name,
                    type: ChannelType.GuildText,
                    topic: ch.topic || '',
                    parent: category.id,
                    permissionOverwrites,
                });
                results.channels.push(ch.name);
            }
        }

        const lines = [
            `✅ **Setup complete for ${guild.name}**`,
            ``,
            `🎭 Roles created: ${results.roles.length > 0 ? results.roles.map((r) => `\`${r}\``).join(', ') : 'none (all existed)'}`,
            `📁 Categories created: ${results.categories.length}`,
            `💬 Channels created: ${results.channels.length}`,
            `⏭️ Skipped (already existed): ${results.skipped.length}`,
        ];

        await interaction.editReply(lines.join('\n'));
    },
};
