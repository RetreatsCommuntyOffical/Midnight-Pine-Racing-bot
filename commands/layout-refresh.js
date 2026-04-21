const { PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { refreshAllLeaderboards } = require('../core/racing/leaderboardPoster');
const { postTeamHubEmbed } = require('../core/teamHubService');
const { postSupportHubEmbed } = require('../core/ticketService');

const WELCOME_BANNER_URL = String(process.env.WELCOME_BANNER_URL || '').trim();
const ROLE_SELECTION_BANNER_URL = String(process.env.ROLE_SELECTION_BANNER_URL || '').trim();

const STRUCTURE = [
    { category: '🚦 START HERE', channels: ['🏁┃welcome', '📋┃rules', '🎯┃how-to-start', '🎭┃role-selection', '🤖┃bot-commands', '📢┃announcements'] },
    { category: '🗺️ MIDNIGHT RELEASES', channels: ['🗺️┃map-releases', '🚗┃vehicle-releases', '📦┃update-log', '🔥┃sneak-peeks', '🧪┃testing-access'] },
    { category: '🏁 RACE CONTROL', channels: ['🏁┃race-lobby', '📊┃race-results', '🚦┃run-submissions', '📈┃high-scores'] },
    { category: '📊 LEADERBOARDS', channels: ['🏆┃solo-board', '🏙️┃street-board', '🏁┃circuit-board', '👥┃team-board'] },
    { category: '👥 TEAMS', channels: ['👥┃team-hub', '📋┃team-roster'] },
    { category: '📅 EVENTS', channels: ['📅┃events', '🔔┃event-alerts'] },
    { category: '🎫 TICKET HUB', channels: ['🎫┃support-hub', '📁┃ticket-logs'] },
    { category: '💬 COMMUNITY', channels: ['💬┃general', '🎙️┃media', '💡┃suggestions'] },
    { category: '🔧 STAFF ROOM', channels: ['🔧┃staff-chat', '📋┃run-review', '📊┃bot-logs'] },
];

module.exports = {
    data: {
        name: 'layout-refresh',
        description: 'Rehome channels and refresh core embeds/leaderboards without recreating roles.',
        defaultMemberPermissions: String(PermissionFlagsBits.Administrator),
    },

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', flags: 64 });
            return;
        }

        await interaction.deferReply({ flags: 64 });

        const guild = interaction.guild;
        const moved = [];
        const missing = [];

        for (const section of STRUCTURE) {
            const category = guild.channels.cache.find(
                (c) => c.type === ChannelType.GuildCategory && c.name === section.category
            );
            if (!category) {
                missing.push(`Category: ${section.category}`);
                continue;
            }

            for (const channelName of section.channels) {
                const channel = guild.channels.cache.find((c) => c.isTextBased() && c.name === channelName);
                if (!channel) {
                    missing.push(`Channel: ${channelName}`);
                    continue;
                }
                if (channel.parentId !== category.id) {
                    await channel.setParent(category.id, { lockPermissions: false }).catch(() => null);
                    moved.push(channelName);
                }
            }
        }

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
            if (WELCOME_BANNER_URL) welcomeEmbed.setImage(WELCOME_BANNER_URL);
            await upsertBotEmbed(welcomeChannel, interaction.client, welcomeEmbed);
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
            if (ROLE_SELECTION_BANNER_URL) roleEmbed.setImage(ROLE_SELECTION_BANNER_URL);

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('role_street').setLabel('🏎️ Street Driver').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('role_circuit').setLabel('🏁 Circuit Driver').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('role_racer').setLabel('🚦 Racer').setStyle(ButtonStyle.Success),
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('role_creator').setLabel('🎥 Content Creator').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('role_partner').setLabel('🤝 Partner').setStyle(ButtonStyle.Secondary),
            );

            await upsertBotEmbed(roleChannel, interaction.client, roleEmbed, [row1, row2]);
        }

        const supportHub = guild.channels.cache.find((c) => c.isTextBased() && c.name === '🎫┃support-hub');
        if (supportHub) await postSupportHubEmbed(interaction.client, supportHub.id).catch(() => null);

        const teamHub = guild.channels.cache.find((c) => c.isTextBased() && c.name === '👥┃team-hub');
        if (teamHub) await postTeamHubEmbed(interaction.client, teamHub.id).catch(() => null);

        await refreshAllLeaderboards(interaction.client, guild).catch(() => null);

        const lines = [
            '✅ Layout refresh complete.',
            `↪️ Channels moved: ${moved.length}`,
            `⚠️ Missing items: ${missing.length}`,
        ];

        if (missing.length > 0) {
            lines.push('', 'Missing examples:');
            lines.push(...missing.slice(0, 8).map((m) => `- ${m}`));
        }

        await interaction.editReply(lines.join('\n'));
    },
};

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
