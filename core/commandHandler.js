const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

function loadCommands() {
    const commands = new Map();
    const dir = path.join(__dirname, '..', 'commands');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));

    for (const file of files) {
        const mod = require(path.join(dir, file));
        if (mod?.data?.name && typeof mod.execute === 'function') {
            commands.set(mod.data.name, mod);
        }
    }

    return commands;
}

async function registerCommands(commands) {
    const { BOT_TOKEN, CLIENT_ID, HOME_GUILD_ID } = process.env;

    if (!BOT_TOKEN || !CLIENT_ID || !HOME_GUILD_ID) {
        console.warn('⚠️  Missing BOT_TOKEN, CLIENT_ID, or HOME_GUILD_ID — skipping command registration.');
        return;
    }

    const rest = new REST().setToken(BOT_TOKEN);
    const body = [...commands.values()].map((c) => c.data);

    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, HOME_GUILD_ID), { body });
        console.log(`✅ Registered ${body.length} slash commands in guild ${HOME_GUILD_ID}`);
    } catch (err) {
        console.error('Command registration failed:', err.message);
    }
}

module.exports = { loadCommands, registerCommands };
