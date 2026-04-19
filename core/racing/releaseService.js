const { EmbedBuilder } = require('discord.js');
const Release = require('../../models/Release');
const broker  = require('../messageBroker');

const DIVIDER = '━━━━━━━━━━━━━━━━━━';

const CHANNEL_NAMES = {
    map:     '🗺️┃map-releases',
    vehicle: '🚗┃vehicle-releases',
    update:  '📦┃update-log',
    sneak:   '🔥┃sneak-peeks',
};

// ─── Embed builders ───────────────────────────────────────────────────────────

function buildMapEmbed(r) {
    const fields = [];
    if (r.mapType)    fields.push({ name: '🏁 Type',        value: r.mapType,    inline: true });
    if (r.environment) fields.push({ name: '🌃 Environment', value: r.environment, inline: true });
    if (r.difficulty)  fields.push({ name: '⚡ Difficulty',  value: r.difficulty,  inline: true });
    for (const s of r.specs || []) fields.push({ name: s.label, value: s.value, inline: true });

    const embed = new EmbedBuilder()
        .setColor(0x4a235a)
        .setTitle('🗺️  Midnight Pine Racing — Map Drop')
        .setDescription(`**${r.title}**\n\n${r.description || 'A new track is live on the streets.'}`);
    if (fields.length) { embed.addFields({ name: DIVIDER, value: ' ' }, ...fields, { name: DIVIDER, value: 'Available now. Run the night.' }); }
    else embed.setFooter({ text: 'Available now. Run the night.' });
    if (r.imageUrl) embed.setImage(r.imageUrl);
    return embed.setTimestamp();
}

function buildVehicleEmbed(r) {
    const fields = [];
    if (r.vehicleClass)    fields.push({ name: '🏎️ Class',     value: r.vehicleClass,    inline: true });
    if (r.topSpeed)        fields.push({ name: '⚡ Top Speed', value: r.topSpeed,        inline: true });
    if (r.handling)        fields.push({ name: '🧩 Handling',  value: r.handling,        inline: true });
    if (r.vehicleCategory) fields.push({ name: '📂 Category',  value: r.vehicleCategory, inline: true });
    for (const s of r.specs || []) fields.push({ name: s.label, value: s.value, inline: true });

    const embed = new EmbedBuilder()
        .setColor(0x0a3d62)
        .setTitle('🚗  Midnight Pine Racing — Vehicle Drop')
        .setDescription(`**${r.title}**\n\n${r.description || 'A new machine is ready in the garage.'}`);
    if (fields.length) { embed.addFields({ name: DIVIDER, value: ' ' }, ...fields, { name: DIVIDER, value: 'Available in garage now.' }); }
    else embed.setFooter({ text: 'Available in garage now.' });
    if (r.imageUrl) embed.setImage(r.imageUrl);
    return embed.setTimestamp();
}

function buildUpdateEmbed(r) {
    const groups = (r.changes || []).map((g) => `**${g.category}**\n${(g.items || []).map((i) => `- ${i}`).join('\n')}`);
    const embed = new EmbedBuilder()
        .setColor(0x1a252f)
        .setTitle(`📦  Midnight Pine Racing — Update ${r.version || ''}`.trim())
        .setDescription(groups.length ? groups.join('\n\n') : r.description || 'Patch notes incoming.')
        .addFields({ name: DIVIDER, value: 'Stay fast. Stay updated.' });
    if (r.imageUrl) embed.setImage(r.imageUrl);
    return embed.setTimestamp();
}

function buildSneakEmbed(r) {
    const embed = new EmbedBuilder()
        .setColor(0x922b21)
        .setTitle('🔥  Incoming Drop')
        .setDescription(`${r.description || 'Something new is coming to the streets…'}\n\n${DIVIDER}\nStay ready.`);
    if (r.scheduledFor) {
        embed.addFields({ name: '⏳ Drops', value: `<t:${Math.floor(new Date(r.scheduledFor).getTime() / 1000)}:R>`, inline: true });
    }
    if (r.imageUrl) embed.setImage(r.imageUrl);
    return embed.setTimestamp();
}

function buildEmbed(release) {
    switch (release.type) {
        case 'map':     return buildMapEmbed(release);
        case 'vehicle': return buildVehicleEmbed(release);
        case 'update':  return buildUpdateEmbed(release);
        case 'sneak':   return buildSneakEmbed(release);
        default: throw new Error(`Unknown release type: ${release.type}`);
    }
}

// ─── Post ─────────────────────────────────────────────────────────────────────

async function postRelease(client, guild, release) {
    const channel = guild?.channels.cache.find((c) => c.name === CHANNEL_NAMES[release.type] && c.isTextBased());
    if (!channel) return null;

    const embed   = buildEmbed(release);
    const content = release.pingRoleId ? `<@&${release.pingRoleId}>` : undefined;
    const message = await broker.send(channel, { content, embeds: [embed] });

    release.status           = 'live';
    release.postedMessageId  = message.id;
    release.postedChannelId  = channel.id;
    await release.save();
    return message;
}

// ─── Service ──────────────────────────────────────────────────────────────────

async function createRelease(params) {
    const { type, title, scheduleIso } = params;
    if (!type || !title) throw new Error('type and title are required.');

    const scheduledFor = scheduleIso ? new Date(scheduleIso) : null;
    if (scheduledFor && Number.isNaN(scheduledFor.getTime())) throw new Error('Invalid schedule time.');

    return Release.create({
        type,
        title,
        description:     params.description     || '',
        imageUrl:        params.imageUrl         || null,
        mapType:         params.mapType          || null,
        environment:     params.environment      || null,
        difficulty:      params.difficulty       || null,
        vehicleClass:    params.vehicleClass     || null,
        topSpeed:        params.topSpeed         || null,
        handling:        params.handling         || null,
        vehicleCategory: params.vehicleCategory  || null,
        version:         params.version          || null,
        changes:         params.changes          || [],
        specs:           params.specs            || [],
        pingRoleId:      params.pingRoleId        || null,
        scheduledFor,
        status:          scheduledFor ? 'scheduled' : 'draft',
        createdByDiscordId: params.createdByDiscordId,
    });
}

async function listScheduledReleases(limit = 10) {
    return Release.find({ status: 'scheduled' }).sort({ scheduledFor: 1 }).limit(limit);
}

async function processScheduledReleases(client) {
    if (!client?.isReady?.()) return;

    const due = await Release.find({ status: 'scheduled', scheduledFor: { $lte: new Date() } }).limit(20);
    const guild =
        (process.env.HOME_GUILD_ID && client.guilds.cache.get(process.env.HOME_GUILD_ID)) ||
        client.guilds.cache.first();

    for (const release of due) {
        await postRelease(client, guild, release).catch(() => null);
    }
}

module.exports = { createRelease, buildEmbed, postRelease, listScheduledReleases, processScheduledReleases };
