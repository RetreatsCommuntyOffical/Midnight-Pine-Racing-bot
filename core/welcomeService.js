'use strict';

async function getWelcomeChannel(guild) {
    const explicitId = process.env.WELCOME_CHANNEL_ID || '';
    if (explicitId) {
        return guild.channels.cache.get(explicitId) || null;
    }
    return guild.channels.cache.find((c) => c.isTextBased() && c.name === '🏁┃welcome') || null;
}

async function handleMemberJoin(member) {
    const guild = member.guild;
    const channel = await getWelcomeChannel(guild);
    if (!channel) return;

    const msg = await channel.send({
        content: `🏁 Welcome to **${guild.name}**, <@${member.id}>! Read <#${channel.id}> and get ready to race.`,
        allowedMentions: { users: [member.id] },
    }).catch(() => null);

    if (!msg) return;
    if (!msg.pinned) {
        await msg.pin().catch(() => null);
    }
}

module.exports = { handleMemberJoin };
