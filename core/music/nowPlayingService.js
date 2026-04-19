'use strict';

const { EmbedBuilder } = require('discord.js');
const broker           = require('../messageBroker');
const { getCurrentTrack, listStations, getStation } = require('./stationManager');

const STATION_COLORS = { 'midnight-fm': 0x4a235a, 'drift-fm': 0xe17055, 'rush-fm': 0x00cec9 };
const STATION_ICONS  = { 'midnight-fm': '🌙',     'drift-fm': '🔥',     'rush-fm': '⚡' };

function buildNowPlayingEmbed(station, track) {
    const icon    = STATION_ICONS[station.slug] || station.icon || '📻';
    const color   = STATION_COLORS[station.slug] || station.color || 0x4a235a;
    const started = track?.startedAt
        ? Math.floor(new Date(track.startedAt).getTime() / 1000)
        : null;

    return new EmbedBuilder()
        .setColor(color)
        .setTitle(`${icon} Now Playing — ${station.name}`)
        .setDescription(
            `**${track?.trackTitle || 'Unknown Track'}**\n` +
            `by ${track?.trackArtist || 'Unknown Artist'}` +
            (started ? `\n\n⏱️ Started <t:${started}:R>` : '')
        )
        .addFields({ name: '📡 Station', value: station.name, inline: true })
        .setFooter({ text: 'MIDNIGHT PINE RACING — Radio System' })
        .setTimestamp();
}

async function postNowPlayingAnnouncement(client, stationSlug) {
    const channelId = process.env.MUSIC_ANNOUNCE_CHANNEL_ID;
    if (!channelId) return;
    const guild = client.guilds.cache.get(process.env.HOME_GUILD_ID) || client.guilds.cache.first();
    if (!guild) return;
    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;

    const station = await getStation(stationSlug);
    if (!station) return;
    const track = await getCurrentTrack(stationSlug);
    const embed = buildNowPlayingEmbed(station, track);
    broker.queue(channel, { embeds: [embed] });
}

async function buildAllStationsEmbed() {
    const stations = await listStations();
    const embed = new EmbedBuilder()
        .setColor(0x4a235a)
        .setTitle('📻 MIDNIGHT PINE RACING — Radio Stations')
        .setDescription('━━━━━━━━━━━━━━━━━━');

    for (const station of stations) {
        const icon  = STATION_ICONS[station.slug] || station.icon || '📻';
        const track = await getCurrentTrack(station.slug);
        const value = track
            ? `🎵 **${track.trackTitle}** by ${track.trackArtist}`
            : '_Nothing playing yet_';
        embed.addFields({
            name: `${icon} ${station.name}${station.memberOnly ? ' 👑' : ''}`,
            value: `${station.description || ''}\n${value}`,
            inline: false,
        });
    }

    embed
        .setFooter({ text: 'Use /radio set-station to tune in • /song now for track details' })
        .setTimestamp();

    return embed;
}

module.exports = { buildNowPlayingEmbed, postNowPlayingAnnouncement, buildAllStationsEmbed };
