const { EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const Team = require('../../models/Team');
const DriverProfile = require('../../models/DriverProfile');

const ROSTER_CHANNEL_NAME = '📋┃team-roster';
const TEAMS_BANNER_URL = process.env.TEAMS_BANNER_URL || '';

function pinnedMessagesToArray(pinned) {
    if (!pinned) return [];
    if (Array.isArray(pinned)) return pinned;
    if (typeof pinned.values === 'function') return [...pinned.values()];
    return [];
}

async function fetchBotRosterEmbeds(channel, botId, maxMessages = 500) {
    const collected = [];
    let before = null;

    while (collected.length < maxMessages) {
        const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
        if (!batch || batch.size === 0) break;

        for (const msg of batch.values()) {
            const isRoster = msg.author.id === botId
                && msg.embeds.length > 0
                && msg.embeds[0].title === '👥 Team Roster Board';
            if (isRoster) collected.push(msg);
        }

        before = batch.last().id;
    }

    return collected.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
}

function safeChunk(lines, max = 20) {
    if (!lines.length) return ['No entries yet.'];
    const chunks = [];
    for (let i = 0; i < lines.length; i += max) {
        chunks.push(lines.slice(i, i + max).join('\n'));
    }
    return chunks;
}

async function buildTeamRosterEmbed() {
    let teams = [];
    let allProfiles = [];

    try {
        if (mongoose.connection.readyState !== 1) throw new Error('DB offline');
        teams = await Team.find({}).sort({ totalPoints: -1, name: 1 });
        allProfiles = await DriverProfile.find({}).sort({ totalPoints: -1, displayName: 1 });
    } catch {
        const offlineEmbed = new EmbedBuilder()
            .setColor(0x636e72)
            .setTitle('👥 Team Roster Board')
            .setDescription('Roster data is temporarily unavailable because the database is not connected.')
            .addFields(
                { name: '🏁 Teams', value: 'Database offline', inline: false },
                { name: '🔎 Looking For Team', value: 'Database offline', inline: false }
            )
            .setTimestamp()
            .setFooter({ text: 'Midnight Pine Racing' });

        if (TEAMS_BANNER_URL) offlineEmbed.setImage(TEAMS_BANNER_URL);
        return offlineEmbed;
    }

    const teamsById = new Map(teams.map((t) => [String(t._id), t]));

    const memberProfiles = allProfiles.filter((p) => p.teamId && teamsById.has(String(p.teamId)));
    const lftProfiles = allProfiles.filter((p) => !p.teamId);

    const memberBuckets = new Map();
    for (const team of teams) memberBuckets.set(String(team._id), []);
    for (const p of memberProfiles) {
        const key = String(p.teamId);
        if (!memberBuckets.has(key)) memberBuckets.set(key, []);
        memberBuckets.get(key).push(p);
    }

    const teamLines = [];
    teams.forEach((team, idx) => {
        const members = (memberBuckets.get(String(team._id)) || []).sort((a, b) => Number(b.totalPoints || 0) - Number(a.totalPoints || 0));
        const lead = members[0] ? `<@${members[0].discordId}>` : 'No members';
        teamLines.push(`**${idx + 1}. ${team.name}** — ${team.totalPoints} pts · ${members.length} member(s) · Lead: ${lead}`);
    });

    const lftLines = lftProfiles.map((p, idx) => `**${idx + 1}.** <@${p.discordId}> · ${p.totalPoints || 0} pts · ${p.tier || 'Rookie'}`);

    const teamChunks = safeChunk(teamLines, 12);
    const lftChunks = safeChunk(lftLines, 12);

    const embed = new EmbedBuilder()
        .setColor(0x00b894)
        .setTitle('👥 Team Roster Board')
        .setDescription('Live list of current teams and drivers looking for a team.')
        .setTimestamp()
        .setFooter({ text: 'Midnight Pine Racing' });

    if (TEAMS_BANNER_URL) embed.setImage(TEAMS_BANNER_URL);

    embed.addFields({ name: `🏁 Teams (${teams.length})`, value: teamChunks[0], inline: false });
    for (let i = 1; i < teamChunks.length; i++) {
        embed.addFields({ name: `🏁 Teams (cont. ${i + 1})`, value: teamChunks[i], inline: false });
    }

    embed.addFields({ name: `🔎 Looking For Team (${lftProfiles.length})`, value: lftChunks[0], inline: false });
    for (let i = 1; i < lftChunks.length; i++) {
        embed.addFields({ name: `🔎 Looking For Team (cont. ${i + 1})`, value: lftChunks[i], inline: false });
    }

    return embed;
}

async function postOrUpdateTeamRoster(client, guild) {
    if (!guild || !client?.user) return null;

    const channel = guild.channels.cache.find((c) => c.name === ROSTER_CHANNEL_NAME && c.isTextBased());
    if (!channel) return null;

    const embed = await buildTeamRosterEmbed();

    // If history cannot be read, bail out instead of sending blindly.
    const rosterEmbeds = await fetchBotRosterEmbeds(channel, client.user.id).catch(() => null);
    if (rosterEmbeds === null) return null;

    let primary = rosterEmbeds[0] || null;
    if (primary) {
        await primary.edit({ embeds: [embed] }).catch(() => null);
    } else {
        primary = await channel.send({ embeds: [embed] }).catch(() => null);
    }

    if (!primary) return null;

    for (const duplicate of rosterEmbeds.slice(1)) {
        await duplicate.delete().catch(() => null);
    }

    const pinned = await channel.messages.fetchPins().catch(() => null);
    for (const msg of pinnedMessagesToArray(pinned)) {
        if (msg.author.id === client.user.id && msg.id !== primary.id) {
            await msg.unpin().catch(() => null);
        }
    }

    if (!primary.pinned) await primary.pin().catch(() => null);
    return primary;
}

module.exports = {
    buildTeamRosterEmbed,
    postOrUpdateTeamRoster,
};
