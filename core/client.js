const { Client, GatewayIntentBits, Partials } = require('discord.js');

const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
];

if (String(process.env.ENABLE_GUILD_MEMBERS_INTENT || 'false').toLowerCase() === 'true') {
    intents.push(GatewayIntentBits.GuildMembers);
}

const client = new Client({
    intents,
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

module.exports = client;
