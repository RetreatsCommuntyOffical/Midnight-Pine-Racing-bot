/**
 * Standalone command registration script.
 * Run manually if you need to force-push slash commands to your guild
 * outside of bot startup.
 *
 * Usage: node deploy-commands.js
 */

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const { BOT_TOKEN, CLIENT_ID, HOME_GUILD_ID } = process.env;

if (!BOT_TOKEN || !CLIENT_ID || !HOME_GUILD_ID) {
    console.error('Missing BOT_TOKEN, CLIENT_ID, or HOME_GUILD_ID in .env');
    process.exit(1);
}

const commands = [];
const cmdDir   = path.join(__dirname, 'commands');

for (const file of fs.readdirSync(cmdDir).filter((f) => f.endsWith('.js'))) {
    const cmd = require(path.join(cmdDir, file));
    if (cmd?.data?.name) {
        commands.push(cmd.data);
        console.log(`  Loaded: ${cmd.data.name}`);
    }
}

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

(async () => {
    try {
        console.log(`\nRegistering ${commands.length} slash command(s) to guild ${HOME_GUILD_ID}...`);
        const result = await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, HOME_GUILD_ID),
            { body: commands }
        );
        console.log(`✅ Successfully registered ${result.length} command(s).`);
    } catch (err) {
        console.error('Registration failed:', err.message);
        process.exit(1);
    }
})();
