require("dotenv").config();
const { Client, GatewayIntentBits, ChannelType } = require("discord.js");
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once("clientReady", async () => {
    try {
        const guild = await client.guilds.fetch(process.env.HOME_GUILD_ID);
        if (!guild) {
            console.error("Guild not found");
            process.exit(1);
        }
        const channels = await guild.channels.fetch();
        const categories = channels.filter(c => c.type === ChannelType.GuildCategory);
        console.log("--- ALL CATEGORIES ---");
        const list = [];
        categories.forEach(cat => {
            const normalized = cat.name.toLowerCase().replace(/[^\w\s]/gi, "").trim().replace(/\s+/g, " ");
            const data = { id: cat.id, name: cat.name, position: cat.position, normalized };
            list.push(data);
            console.log("[" + cat.id + "] Pos: " + cat.position + " | Name: \"" + cat.name + "\" | Key: \"" + normalized + "\"");
        });
        console.log("\n--- POTENTIAL DUPLICATES ---");
        const groups = {};
        list.forEach(item => {
            if (!groups[item.normalized]) groups[item.normalized] = [];
            groups[item.normalized].push(item);
        });
        let dupesFound = false;
        for (const key in groups) {
            if (groups[key].length > 1) {
                dupesFound = true;
                console.log("Group: \"" + key + "\"");
                groups[key].forEach(item => {
                    console.log("  - [" + item.id + "] \"" + item.name + "\" (Pos: " + item.position + ")");
                });
            }
        }
        if (!dupesFound) console.log("No duplicates found.");
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
});
client.login(process.env.BOT_TOKEN);
