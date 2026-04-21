const { PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { refreshAllLeaderboards } = require('../core/racing/leaderboardPoster');
const { postTeamHubEmbed } = require('../core/teamHubService');
const { postSupportHubEmbed } = require('../core/ticketService');

const BannerStore = require('../core/racing/bannerStore');

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
        category: '🚦 START HERE',
        channels: [
            { name: '🏁┃welcome',         topic: 'Welcome and server entry point.' },
            { name: '📋┃rules',           topic: 'Server rules. Read before racing.' },
            { name: '🎯┃how-to-start',    topic: 'Quick start guide for new racers.' },
            { name: '🎭┃role-selection',  topic: 'Choose your racing roles and perks.' },
            { name: '🤖┃bot-commands',    topic: 'Use all public bot commands here.' },
            { name: '📢┃announcements',   topic: 'Official Midnight Pine Racing announcements.' },
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
            { name: '📈┃high-scores',    topic: 'Automated highlights for top runs and records.' },
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
        category: '🎫 TICKET HUB',
        channels: [
            { name: '🎫┃support-hub', topic: 'Open support tickets and contact staff.' },
            { name: '📁┃ticket-logs', topic: 'Ticket close/archive logs for staff.' },
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
            await interaction.reply({ content: 'Administrator permission required.', flags: 64 });
            return;
        }

        await interaction.deferReply({ flags: 64 });

        const guild = interaction.guild;
        const results = { roles: [], categories: [], channels: [], moved: [], skipped: [], embeds: [] };

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

        await ensureStructure(guild, staffRoles, results);

        // ── Post persistent utility embeds in their correct channels ────────
        await refreshLayoutEmbeds(interaction.client, guild, results);

        const lines = [
            `✅ **Setup complete for ${guild.name}**`,
            ``,
            `🎭 Roles created: ${results.roles.length > 0 ? results.roles.map((r) => `\`${r}\``).join(', ') : 'none (all existed)'}`,
            `📁 Categories created: ${results.categories.length}`,
            `💬 Channels created: ${results.channels.length}`,
            `↪️ Channels moved to correct category: ${results.moved.length}`,
            `🧩 Embeds posted/updated: ${results.embeds.length > 0 ? results.embeds.join(', ') : 'none'}`,
            `⏭️ Skipped (already existed): ${results.skipped.length}`,
        ];

        await interaction.editReply(lines.join('\n'));
    },
};

async function ensureStructure(guild, staffRoles, results) {
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
                if (exists.parentId !== category.id) {
                    await exists.setParent(category.id, { lockPermissions: false }).catch(() => null);
                    results.moved.push(ch.name);
                }
                if (ch.topic && exists.topic !== ch.topic) {
                    await exists.setTopic(ch.topic).catch(() => null);
                }
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
}

async function upsertBotEmbed(channel, client, embed, components = []) {
    const matches = [];
    let before;
    for (let page = 0; page < 5; page++) {
        const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
        if (!batch || batch.size === 0) break;
        for (const msg of batch.values()) {
            if (msg.author.id === client.user.id && msg.embeds.length > 0 && msg.embeds[0].title === embed.data.title) {
                matches.push(msg);
            }
        }
        before = batch.last().id;
    }

    let primary = matches.sort((a, b) => b.createdTimestamp - a.createdTimestamp)[0] || null;
    if (primary) {
        await primary.edit({ embeds: [embed], components }).catch(() => null);
    } else {
        primary = await channel.send({ embeds: [embed], components }).catch(() => null);
    }

    if (!primary) return;

    for (const duplicate of matches) {
        if (duplicate.id === primary.id) continue;
        await duplicate.delete().catch(() => null);
    }
}

async function refreshLayoutEmbeds(client, guild, results) {
    const welcomeChannel = guild.channels.cache.find((c) => c.isTextBased() && c.name === '🏁┃welcome');
    if (welcomeChannel) {
        const welcomeEmbed = new EmbedBuilder()
            .setColor(0x1abc9c)
            .setTitle('🏁 Welcome to Midnight Pine Racing')
            .setDescription([
                'Start here and get race-ready quickly:',
                '',
                '1. Read **📋┃rules**',
                '2. Pick roles in **🎭┃role-selection**',
                '3. Use **🤖┃bot-commands** for stats, events, and progression',
                '4. Submit runs in **🚦┃run-submissions**',
            ].join('\n'))
            .setFooter({ text: 'Midnight Pine Racing' })
            .setTimestamp();
        if (BannerStore.getBanner('welcome')) welcomeEmbed.setImage(BannerStore.getBanner('welcome'));
        await upsertBotEmbed(welcomeChannel, client, welcomeEmbed);
        results.embeds.push('Welcome');
        await new Promise((r) => setTimeout(r, 1200));
    }

    const roleChannel = guild.channels.cache.find((c) => c.isTextBased() && c.name === '🎭┃role-selection');
    if (roleChannel) {
        const roleEmbed = new EmbedBuilder()
            .setColor(0x4a235a)
            .setTitle('🚦 Midnight Pine Racing — Role Selection')
            .setDescription(
                '━━━━━━━━━━━━━━━━━━\n' +
                '**🏎️ Street Driver** — No Hesi runs and street racing\n' +
                '**🏁 Circuit Driver** — Track events and circuit races\n' +
                '**🚦 Racer** — Compete in all formats\n\n' +
                '**🎥 Content Creator** — Share your racing content\n' +
                '**🤝 Partner** — Partner server member\n' +
                '━━━━━━━━━━━━━━━━━━\n' +
                '_Click to add or remove. Toggle anytime._'
            );
            if (BannerStore.getBanner('role_selection')) roleEmbed.setImage(BannerStore.getBanner('role_selection'));

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('role_street').setLabel('🏎️ Street Driver').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('role_circuit').setLabel('🏁 Circuit Driver').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('role_racer').setLabel('🚦 Racer').setStyle(ButtonStyle.Success),
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('role_creator').setLabel('🎥 Content Creator').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('role_partner').setLabel('🤝 Partner').setStyle(ButtonStyle.Secondary),
        );

        await upsertBotEmbed(roleChannel, client, roleEmbed, [row1, row2]);
        results.embeds.push('Role Selection');
        await new Promise((r) => setTimeout(r, 1200));
    }

    const supportHub = guild.channels.cache.find((c) => c.isTextBased() && c.name === '🎫┃support-hub');
    if (supportHub) {
        await postSupportHubEmbed(client, supportHub.id).catch(() => null);
        results.embeds.push('Support Hub');
        await new Promise((r) => setTimeout(r, 1200));
    }

    const teamHub = guild.channels.cache.find((c) => c.isTextBased() && c.name === '👥┃team-hub');
    if (teamHub) {
        await postTeamHubEmbed(client, teamHub.id).catch(() => null);
        results.embeds.push('Team Hub');
        await new Promise((r) => setTimeout(r, 1200));
    }

    await refreshAllLeaderboards(client, guild).catch(() => null);
    results.embeds.push('Leaderboards');
}
