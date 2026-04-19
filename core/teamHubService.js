'use strict';

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType,
    PermissionFlagsBits,
} = require('discord.js');

const STAFF_ROLE_NAMES = ['👑 Admin', '🔧 Staff', '🛡️ Moderator', '🎙️ Host'];
const HUB_EMBED_TITLE  = '🏁 Team Hub';

// In-memory dedup: userId → Set of open types ('apply' | 'create')
const openHubChannels = new Map();

// ── Post or edit the persistent hub embed ────────────────────────────────────
async function postTeamHubEmbed(client, channelId) {
    channelId = channelId || process.env.TEAM_HUB_CHANNEL_ID;
    if (!channelId) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        console.warn('[teamHub] Channel not found or not text-based:', channelId);
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle(HUB_EMBED_TITLE)
        .setColor(0x2f3136)
        .setDescription([
            '## Welcome to the Team Hub',
            '',
            'This is your gateway to competitive team racing at **Midnight Pine Racing**.',
            'Choose an option below to get started.',
            '',
            '### 📋  Apply to a Team',
            'Looking to join an existing team? Submit a short application and a staff member',
            'will match you with teams that suit your skill level and playstyle.',
            '',
            '### 🏗️  Create a Team',
            'Want to build your own team from the ground up? Submit your proposal with your',
            'team name, goals, and leadership background — staff will review and approve it.',
            '',
            '───────────────────────────────────────',
            '*All submissions open a private channel. Staff will follow up with you there.*',
        ].join('\n'))
        .setFooter({ text: 'Midnight Pine Racing  •  Team Hub' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('teamhub_apply')
            .setLabel('Apply to Team')
            .setEmoji('📋')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('teamhub_create')
            .setLabel('Create Team')
            .setEmoji('🏗️')
            .setStyle(ButtonStyle.Primary),
    );

    const existing = await fetchHubMessage(channel, client);
    if (existing) {
        await existing.edit({ embeds: [embed], components: [row] }).catch(() => null);
        console.log('[teamHub] Hub embed updated in channel', channelId);
    } else {
        await channel.send({ embeds: [embed], components: [row] });
        console.log('[teamHub] Hub embed posted to channel', channelId);
    }
}

async function fetchHubMessage(channel, client) {
    let before;
    for (let page = 0; page < 5; page++) {
        const opts = { limit: 100 };
        if (before) opts.before = before;
        const msgs = await channel.messages.fetch(opts).catch(() => null);
        if (!msgs || msgs.size === 0) break;
        const found = msgs.find(
            m => m.author.id === client.user.id &&
                 m.embeds.length > 0 &&
                 m.embeds[0].title === HUB_EMBED_TITLE,
        );
        if (found) return found;
        before = msgs.last().id;
    }
    return null;
}

// ── Modal: Apply to Team ──────────────────────────────────────────────────────
function buildApplyModal() {
    return new ModalBuilder()
        .setCustomId('teamhub_apply_modal')
        .setTitle('Team Application')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('apply_username')
                    .setLabel('Roblox Username')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Your in-game username')
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('apply_experience')
                    .setLabel('Racing Experience')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('e.g. 6 months, competitive solo, street racing')
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('apply_skills')
                    .setLabel('Skills & Playstyle')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Describe your driving strengths, preferred modes, cars you use...')
                    .setRequired(true)
                    .setMaxLength(500),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('apply_activity')
                    .setLabel('Activity Level')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('e.g. Daily, 3–4× per week, weekends only')
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('apply_extra')
                    .setLabel('Anything Else? (optional)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Teams you\'re interested in, goals, or other context...')
                    .setRequired(false)
                    .setMaxLength(300),
            ),
        );
}

// ── Modal: Create a Team ──────────────────────────────────────────────────────
function buildCreateModal() {
    return new ModalBuilder()
        .setCustomId('teamhub_create_modal')
        .setTitle('Create a Team')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('create_name')
                    .setLabel('Team Name')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Your proposed team name')
                    .setRequired(true)
                    .setMaxLength(32),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('create_purpose')
                    .setLabel('Team Purpose & Goals')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('What is your team about? Competitive? Casual? Street? Circuit?')
                    .setRequired(true)
                    .setMaxLength(500),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('create_leadership')
                    .setLabel('Leadership Experience')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Have you led a team before? How do you plan to manage it?')
                    .setRequired(true)
                    .setMaxLength(400),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('create_members')
                    .setLabel('Initial Members (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Any players already committed? Discord tags or usernames')
                    .setRequired(false)
                    .setMaxLength(200),
            ),
        );
}

// ── Handle modal: Apply submission ────────────────────────────────────────────
async function handleApplySubmit(interaction) {
    await interaction.deferReply({ flags: 64 });

    const userId = interaction.user.id;

    // Dedup layer 1: in-memory
    if (!openHubChannels.has(userId)) openHubChannels.set(userId, new Set());
    if (openHubChannels.get(userId).has('apply')) {
        return interaction.editReply({ content: '⚠️ You already have an open **Team Application** channel. Please resolve it before submitting again.' });
    }

    const username   = interaction.fields.getTextInputValue('apply_username');
    const experience = interaction.fields.getTextInputValue('apply_experience');
    const skills     = interaction.fields.getTextInputValue('apply_skills');
    const activity   = interaction.fields.getTextInputValue('apply_activity');
    const extra      = interaction.fields.getTextInputValue('apply_extra') || 'None provided';

    const result = await openReviewChannel(interaction, 'apply');
    if (!result) {
        return interaction.editReply({ content: '⚠️ Could not open a review channel. Please contact a staff member.' });
    }
    if (result.alreadyExists) {
        openHubChannels.get(userId).add('apply');
        return interaction.editReply({ content: `⚠️ You already have an open **Team Application** channel: ${result.channel}\nPlease resolve it before submitting again.` });
    }
    const channel = result.channel;
    openHubChannels.get(userId).add('apply');

    const embed = new EmbedBuilder()
        .setTitle('📋 Team Application')
        .setColor(0x2ecc71)
        .addFields(
            { name: '👤 Applicant',         value: `${interaction.user} (${interaction.user.tag})`, inline: false },
            { name: '🎮 Roblox Username',    value: username,   inline: true  },
            { name: '⏱️ Activity Level',    value: activity,   inline: true  },
            { name: '🏎️ Racing Experience', value: experience, inline: false },
            { name: '🎯 Skills & Playstyle', value: skills,     inline: false },
            { name: '💬 Additional Info',   value: extra,      inline: false },
        )
        .setFooter({ text: 'Midnight Pine Racing  •  Team Applications' })
        .setTimestamp();

    const row = buildCloseRow(interaction.user.id, 'apply');

    await channel.send({
        content: `${interaction.user} — a staff member will review your application shortly.`,
        embeds: [embed],
        components: [row],
    });

    await interaction.editReply({
        content: `✅ Application submitted! A private review channel has been opened: ${channel}`,
    });
}

// ── Handle modal: Create Team submission ──────────────────────────────────────
async function handleCreateSubmit(interaction) {
    await interaction.deferReply({ flags: 64 });

    const userId = interaction.user.id;

    // Dedup layer 1: in-memory
    if (!openHubChannels.has(userId)) openHubChannels.set(userId, new Set());
    if (openHubChannels.get(userId).has('create')) {
        return interaction.editReply({ content: '⚠️ You already have an open **Team Creation** channel. Please resolve it before submitting again.' });
    }

    const name       = interaction.fields.getTextInputValue('create_name');
    const purpose    = interaction.fields.getTextInputValue('create_purpose');
    const leadership = interaction.fields.getTextInputValue('create_leadership');
    const members    = interaction.fields.getTextInputValue('create_members') || 'None listed';

    const result = await openReviewChannel(interaction, 'create');
    if (!result) {
        return interaction.editReply({ content: '⚠️ Could not open a review channel. Please contact a staff member.' });
    }
    if (result.alreadyExists) {
        openHubChannels.get(userId).add('create');
        return interaction.editReply({ content: `⚠️ You already have an open **Team Creation** channel: ${result.channel}\nPlease resolve it before submitting again.` });
    }
    const channel = result.channel;
    openHubChannels.get(userId).add('create');

    const embed = new EmbedBuilder()
        .setTitle('🏗️ Team Creation Request')
        .setColor(0x3498db)
        .addFields(
            { name: '👤 Founder',              value: `${interaction.user} (${interaction.user.tag})`, inline: false },
            { name: '🏁 Proposed Team Name',   value: name,       inline: false },
            { name: '🎯 Purpose & Goals',      value: purpose,    inline: false },
            { name: '👑 Leadership Experience', value: leadership, inline: false },
            { name: '👥 Initial Members',       value: members,    inline: false },
        )
        .setFooter({ text: 'Midnight Pine Racing  •  Team Creation Requests' })
        .setTimestamp();

    const row = buildCloseRow(interaction.user.id, 'create');

    await channel.send({
        content: `${interaction.user} — a staff member will review your team creation request shortly.`,
        embeds: [embed],
        components: [row],
    });

    await interaction.editReply({
        content: `✅ Request submitted! A private review channel has been opened: ${channel}`,
    });
}

// ── Close a review channel ────────────────────────────────────────────────────
async function closeReviewChannel(interaction) {
    await interaction.deferReply();

    // Extract userId and type from customId: teamhub_review_close_<userId>_<type>
    const parts  = interaction.customId.split('_'); // ['teamhub','review','close',userId,type]
    const userId = parts[3] || null;
    const type   = parts[4] || null;

    // Clear in-memory dedup so user can open a new one after close
    if (userId && type && openHubChannels.has(userId)) {
        openHubChannels.get(userId).delete(type);
    }

    await interaction.editReply({ content: '🔒 Closing this channel in 5 seconds...' });
    await new Promise(r => setTimeout(r, 5000));
    await interaction.channel.delete(`Closed by ${interaction.user.tag}`).catch(() => null);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildCloseRow(userId, type) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`teamhub_review_close_${userId}_${type}`)
            .setLabel(type === 'apply' ? 'Close Application' : 'Close Request')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger),
    );
}

async function openReviewChannel(interaction, type) {
    const guild  = interaction.guild;
    const member = interaction.member;
    const userId = member.user.id;

    await guild.roles.fetch();
    await guild.channels.fetch();

    const slug = type === 'apply' ? 'team-apply' : 'team-create';

    // Dedup layer 2: live channel scan — survives bot restarts
    const existing = guild.channels.cache.find(c =>
        c.name && c.name.startsWith(`📋┃${slug}-`) &&
        c.topic && c.topic.includes(`[uid:${userId}]`)
    );
    if (existing) return { channel: existing, alreadyExists: true };

    const staffRoles = STAFF_ROLE_NAMES
        .map(n => guild.roles.cache.find(r => r.name === n))
        .filter(Boolean);

    // Prefer 🎫 TICKET HUB category; fall back to any Teams category
    const cat =
        guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === '🎫 TICKET HUB') ||
        guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && /team/i.test(c.name)) ||
        null;

    const safeName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) || 'user';
    const chanName = `📋┃${slug}-${safeName}`;

    const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
            id: member.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
            ],
        },
        ...staffRoles.map(r => ({
            id: r.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages,
            ],
        })),
    ];

    const channel = await guild.channels.create({
        name: chanName,
        type: ChannelType.GuildText,
        parent: cat ? cat.id : undefined,
        topic: `${type === 'apply' ? '📋 Team Application' : '🏗️ Team Creation'} — submitted by ${member.user.tag} [uid:${userId}]`,
        permissionOverwrites: overwrites,
    }).catch(err => {
        console.error('[teamHub] Failed to create review channel:', err.message);
        return null;
    });

    if (!channel) return null;
    return { channel, alreadyExists: false };
}

module.exports = {
    postTeamHubEmbed,
    buildApplyModal,
    buildCreateModal,
    handleApplySubmit,
    handleCreateSubmit,
    closeReviewChannel,
};
