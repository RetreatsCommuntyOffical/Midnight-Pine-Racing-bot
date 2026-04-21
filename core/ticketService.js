'use strict';
const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const TICKET_TYPES = {
    // ── Active hub ticket types ──────────────────────────────────────────────
    ticket_open_support:  { label: 'General Support',       emoji: '🏎️', color: 0x3498db },
    ticket_open_join:     { label: 'Join the Team',         emoji: '🧑‍🔧', color: 0xe17055 },
    ticket_open_services: { label: 'Services / Purchases',  emoji: '📦', color: 0x9b59b6 },
    ticket_open_report:   { label: 'Report Issues',         emoji: '⚠️', color: 0xe74c3c },
    ticket_open_partner:  { label: 'Partnerships',          emoji: '🤝', color: 0x2ecc71 },
    // ── Legacy types (kept for backward compat with existing open tickets) ───
    ticket_open_dispute: { label: 'Race Dispute', emoji: '⚖️', color: 0xe74c3c },
    ticket_open_team:    { label: 'Team Issue',   emoji: '👥', color: 0x95a5a6 },
    ticket_open_appeal:  { label: 'Ban Appeal',   emoji: '🚫', color: 0xe67e22 },
    ticket_open_bug:     { label: 'Bug Report',   emoji: '🐛', color: 0x1abc9c },
};

const STAFF_ROLE_NAMES = ['👑 Admin', '🔧 Staff', '🛡️ Moderator', '🎙️ Host'];

// In-memory dedup: userId → Set of open customIds (cache layer, cleared on restart)
const openTickets = new Map();

// ── Scan guild channels for an existing open ticket (restart-safe) ────────────
function findExistingTicketChannel(guild, userId, typeKey) {
    const type     = TICKET_TYPES[typeKey];
    const typeSlug = typeKey.replace('ticket_open_', '');
    // Match channels by name prefix AND topic containing userId for accuracy
    return guild.channels.cache.find(c =>
        c.name && c.name.startsWith(`🎫┃${typeSlug}-`) &&
        c.topic && c.topic.includes(userId)
    ) || guild.channels.cache.find(c =>
        // Fallback: match by topic label + userId (handles renamed channels)
        c.topic && c.topic.includes(`${type.emoji} ${type.label}`) && c.topic.includes(userId)
    ) || null;
}

const ticketService = {

    // ── Open a new ticket channel ────────────────────────────────────────────
    async open(interaction) {
        const typeKey = interaction.customId;
        const type    = TICKET_TYPES[typeKey];
        if (!type) return;

        await interaction.deferReply({ flags: 64 });

        const guild  = interaction.guild;
        const member = interaction.member;
        const userId = member.user.id;

        // Dedup layer 1: fast in-memory check
        if (!openTickets.has(userId)) openTickets.set(userId, new Set());
        if (openTickets.get(userId).has(typeKey)) {
            return interaction.editReply({ content: `You already have an open **${type.label}** ticket. Please resolve it before opening another.` });
        }

        await guild.roles.fetch();
        await guild.channels.fetch();

        // Dedup layer 2: persistent scan — survives bot restarts
        const existing = findExistingTicketChannel(guild, userId, typeKey);
        if (existing) {
            // Repopulate in-memory cache so subsequent checks are fast
            openTickets.get(userId).add(typeKey);
            return interaction.editReply({
                content: `You already have an open **${type.label}** ticket: ${existing}\nPlease resolve it before opening another.`,
            });
        }

        // Find the TICKET HUB category
        const cat = guild.channels.cache.find(
            c => c.type === ChannelType.GuildCategory && c.name === '🎫 TICKET HUB'
        );
        if (!cat) {
            return interaction.editReply({ content: '⚠️  Ticket Hub category not found. Ask an admin to run `/ticket setup`.' });
        }

        const staffRoles = STAFF_ROLE_NAMES
            .map(n => guild.roles.cache.find(r => r.name === n))
            .filter(Boolean);

        // Channel name: ticket-<type>-<username>
        const safeName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) || 'user';
        const typeSlug  = typeKey.replace('ticket_open_', '');
        const chanName  = `🎫┃${typeSlug}-${safeName}`;

        const overwrites = [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            {
                id: member.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
            },
            ...staffRoles.map(r => ({
                id: r.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
            })),
        ];

        const channel = await guild.channels.create({
            name: chanName,
            type: ChannelType.GuildText,
            parent: cat.id,
            topic: `${type.emoji} ${type.label} — opened by ${member.user.tag} [uid:${userId}]`,
            permissionOverwrites: overwrites,
        });

        // Mark open
        openTickets.get(userId).add(typeKey);

        // Opening embed
        const embed = new EmbedBuilder()
            .setTitle(`${type.emoji} ${type.label}`)
            .setColor(type.color)
            .setDescription([
                `Welcome ${member}, a staff member will be with you shortly.`,
                '',
                '**Please describe your issue in detail:**',
                '• What happened?',
                '• When did it happen?',
                '• Any screenshots or evidence?',
                '',
                '*Use the button below when your issue is resolved.*',
            ].join('\n'))
            .setFooter({ text: `Ticket opened by ${member.user.tag}` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ticket_close_${userId}_${typeKey}`)
                .setLabel('Close Ticket')
                .setEmoji('🔒')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`ticket_claim_${userId}_${typeKey}`)
                .setLabel('Claim')
                .setEmoji('✋')
                .setStyle(ButtonStyle.Secondary),
        );

        await channel.send({ content: `${member}`, embeds: [embed], components: [row] });
        await interaction.editReply({ content: `✅ Your ticket has been opened: ${channel}` });
    },

    // ── Close ticket via button ──────────────────────────────────────────────
    async closeFromButton(interaction) {
        const parts  = interaction.customId.split('_'); // ticket_close_userId_ticket_open_type
        const userId = parts[2];
        const typeKey = parts.slice(3).join('_');

        await this._doClose(interaction, userId, typeKey);
    },

    // ── Close ticket via /ticket close ──────────────────────────────────────
    async close(interaction) {
        const channel = interaction.channel;
        if (!channel.name.startsWith('🎫┃')) {
            return interaction.reply({ content: 'This command can only be used inside a ticket channel.', flags: 64 });
        }

        // Extract userId and typeKey from topic so in-memory cache is cleared
        const topic   = channel.topic ?? '';
        const uidMatch  = topic.match(/\[uid:(\d+)\]/);
        const tagMatch  = topic.match(/opened by (.+?) \[uid:/);
        const userId  = uidMatch ? uidMatch[1] : null;
        const userTag = tagMatch ? tagMatch[1] : (topic.match(/opened by (.+)$/) || [])[1] || 'unknown';

        // Derive typeKey from channel name slug: 🎫┃<slug>-<username>
        const slugMatch = channel.name.match(/^🎫┃([^-]+)-/);
        const typeKey   = slugMatch ? `ticket_open_${slugMatch[1]}` : null;

        await this._doClose(interaction, userId, typeKey, userTag);
    },

    async _doClose(interaction, userId, typeKey, userTag) {
        await interaction.deferReply();

        const channel = interaction.channel;
        const guild   = interaction.guild;
        const closer  = interaction.member;

        // Log to ticket-logs
        await guild.channels.fetch();
        const logsChannel = guild.channels.cache.find(c => c.name === '📁┃ticket-logs');
        if (logsChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('🔒 Ticket Closed')
                .setColor(0xe74c3c)
                .addFields(
                    { name: 'Channel',  value: channel.name, inline: true },
                    { name: 'Closed by', value: closer.user.tag, inline: true },
                    { name: 'Opened by', value: userTag ?? `<@${userId}>`, inline: true },
                )
                .setTimestamp();
            await logsChannel.send({ embeds: [logEmbed] }).catch(() => null);
        }

        // Clear in-memory dedup
        if (userId && typeKey && openTickets.has(userId)) {
            openTickets.get(userId).delete(typeKey);
        }

        await interaction.editReply({ content: '🔒 Ticket is being closed...' });
        await new Promise(r => setTimeout(r, 3000));
        await channel.delete(`Closed by ${closer.user.tag}`).catch(() => null);
    },

    // ── Claim ticket ─────────────────────────────────────────────────────────
    async claimFromButton(interaction) {
        await this.claim(interaction);
    },

    async claim(interaction) {
        const channel = interaction.channel;
        if (!channel.name.startsWith('🎫┃')) {
            return interaction.reply({ content: 'This command can only be used inside a ticket channel.', flags: 64 });
        }

        await interaction.reply({
            content: `✋ **${interaction.member.user.tag}** has claimed this ticket and will assist you.`,
        });
    },
};

module.exports = { ticketService, TICKET_TYPES, postSupportHubEmbed };

// ── Post or edit the persistent Support Hub embed ─────────────────────────────
const SUPPORT_HUB_TITLE = '🏁 MIDNIGHT PINE RACING — SUPPORT HUB 🏁';
const BannerStore = require('./racing/bannerStore');

async function postSupportHubEmbed(client, channelId) {
    channelId = channelId || process.env.SUPPORT_HUB_CHANNEL_ID;
    const channel = await resolveHubChannel(client, channelId, [
        '🎫┃support-hub',
        '📋┃ticket-panel',
        'support-hub',
        'ticket-panel',
    ]);
    if (!channel || !channel.isTextBased()) {
        console.warn('[supportHub] Channel not found or not text-based:', channelId);
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle(SUPPORT_HUB_TITLE)
        .setColor(0x2f3136)
        .setDescription([
            "Welcome to the official **Midnight Pine Racing Ticket System**.",
            "Use the options below to get support, join the team, or handle racing services.",
            '',
            "━━━━━━━━━━━━━━━━━━━━━━━",
            "📂 **Ticket Options**",
            '',
            "🏎️ **General Support**",
            "Get help with server issues, questions, or assistance.",
            '',
            "🧑‍🔧 **Join the Team**",
            "Apply to become a driver, staff member, or part of the racing crew.",
            '',
            "📦 **Services / Purchases**",
            "Need custom work, purchases, or upgrades? Open a ticket here.",
            '',
            "⚠️ **Report Issues**",
            "Report bugs, rule violations, or problems within the server.",
            '',
            "🤝 **Partnerships**",
            "Interested in collaborating or partnering with Midnight Pine Racing.",
            '',
            "━━━━━━━━━━━━━━━━━━━━━━━",
            "📌 **Guidelines**",
            "• Be clear and detailed when opening tickets",
            "• Do not spam or open multiple tickets",
            "• Respect staff at all times",
            '',
            "🚀 A team member will assist you as soon as possible.",
        ].join('\n'))
        .setFooter({ text: 'Midnight Pine Racing  •  Support Hub' });

    const supportHubBannerUrl = BannerStore.getBanner('support_hub');
    if (supportHubBannerUrl) embed.setImage(supportHubBannerUrl);

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_open_support').setLabel('General Support').setEmoji('🏎️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_open_join').setLabel('Join the Team').setEmoji('🧑‍🔧').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ticket_open_services').setLabel('Services / Purchases').setEmoji('📦').setStyle(ButtonStyle.Secondary),
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_open_report').setLabel('Report Issues').setEmoji('⚠️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket_open_partner').setLabel('Partnerships').setEmoji('🤝').setStyle(ButtonStyle.Success),
    );

    const matches = await _fetchSupportHubMessages(channel, client);
    let primary = matches[0] || null;

    if (primary) {
        await primary.edit({ embeds: [embed], components: [row1, row2] }).catch(() => null);
        console.log('[supportHub] Hub embed updated in channel', channelId);
    } else {
        primary = await channel.send({ embeds: [embed], components: [row1, row2] }).catch(() => null);
        console.log('[supportHub] Hub embed posted to channel', channelId);
    }

    if (!primary) return;
    for (const duplicate of matches.slice(1)) {
        await duplicate.delete().catch(() => null);
    }
}

async function resolveHubChannel(client, preferredId, fallbackNames) {
    if (preferredId) {
        const byId = await client.channels.fetch(preferredId).catch(() => null);
        if (byId && byId.isTextBased()) return byId;
    }

    const guild = client.guilds.cache.get(process.env.HOME_GUILD_ID) || client.guilds.cache.first();
    if (!guild) return null;

    await guild.channels.fetch().catch(() => null);
    const targets = Array.isArray(fallbackNames) ? fallbackNames : [fallbackNames];

    for (const target of targets) {
        const exact = guild.channels.cache.find((c) => c.isTextBased() && c.name === target);
        if (exact) return exact;
    }

    return guild.channels.cache.find((c) => {
        if (!c.isTextBased()) return false;
        const name = String(c.name || '').toLowerCase();
        return name.includes('support-hub') || name.includes('ticket-panel');
    }) || null;
}

async function _fetchSupportHubMessages(channel, client) {
    const matches = [];
    let before;
    for (let page = 0; page < 5; page++) {
        const opts = { limit: 100 };
        if (before) opts.before = before;
        const msgs = await channel.messages.fetch(opts).catch(() => null);
        if (!msgs || msgs.size === 0) break;
        for (const msg of msgs.values()) {
            if (msg.author.id === client.user.id && msg.embeds.length > 0 && msg.embeds[0].title === SUPPORT_HUB_TITLE) {
                matches.push(msg);
            }
        }
        before = msgs.last().id;
    }
    return matches.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
}
