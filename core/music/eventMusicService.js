'use strict';

const { EmbedBuilder } = require('discord.js');
const broker = require('../messageBroker');

const EVENT_DEFS = {
    race_start:   { title: 'Race Day Anthem',     station: 'RUSH FM',    icon: '🏁', color: 0x0a3d62 },
    race_finish:  { title: 'Victory Lap',          station: 'MIDNIGHT FM', icon: '🏆', color: 0xfdcb6e },
    drift_start:  { title: 'Slide Season',         station: 'DRIFT FM',   icon: '🔥', color: 0xe17055 },
    drift_finish: { title: 'Drift Champion',       station: 'DRIFT FM',   icon: '🏅', color: 0xe17055 },
    event_start:  { title: 'Event Begins',         station: 'RUSH FM',    icon: '⚡', color: 0x00cec9 },
    countdown:    { title: 'Pre-Race Countdown',   station: 'RUSH FM',    icon: '⏱️', color: 0xff7675 },
    podium:       { title: 'Podium Theme',          station: 'MIDNIGHT FM', icon: '🥇', color: 0xfdcb6e },
    high_combo:   { title: 'Combo Intensifies',    station: 'DRIFT FM',   icon: '🔥', color: 0xd63031 },
};

function _resolveChannel(client) {
    const channelId = process.env.MUSIC_ANNOUNCE_CHANNEL_ID;
    if (!channelId) return null;
    const guild = client.guilds.cache.get(process.env.HOME_GUILD_ID) || client.guilds.cache.first();
    if (!guild) return null;
    return guild.channels.cache.get(channelId) || null;
}

async function announceEventMusic(client, eventType, extra = {}) {
    const channel = _resolveChannel(client);
    if (!channel) return;

    const def = EVENT_DEFS[eventType];
    if (!def) return;

    const embed = new EmbedBuilder()
        .setColor(def.color)
        .setTitle(`${def.icon} Event Music — ${extra.eventName || eventType.replace(/_/g, ' ').toUpperCase()}`)
        .setDescription(
            `**${def.title}** · ${def.station}\n\n` +
            (extra.description || '_Music has changed to match the event._')
        )
        .setFooter({ text: 'MIDNIGHT PINE RACING — Event System' })
        .setTimestamp();

    broker.queue(channel, { embeds: [embed] });
}

async function handleGameplayEvent(eventType, payload, client) {
    await announceEventMusic(client, eventType, payload).catch(() => null);
}

module.exports = { announceEventMusic, handleGameplayEvent, EVENT_DEFS };
