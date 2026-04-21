require('dotenv').config();
const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

client.once('clientReady', async () => {
    try {
        const guild = await client.guilds.fetch(process.env.HOME_GUILD_ID);
        const channels = await guild.channels.fetch();

        console.log('\n═════════════════════════════════════════════════');
        console.log('CATEGORIES & CHANNELS');
        console.log('═════════════════════════════════════════════════\n');

        // Group channels by category
        const categorized = {};
        const uncategorized = [];

        channels.forEach(channel => {
            if (channel.type === ChannelType.GuildCategory) {
                categorized[channel.id] = {
                    name: channel.name,
                    id: channel.id,
                    type: 'CATEGORY',
                    channels: []
                };
            }
        });

        channels.forEach(channel => {
            if (channel.type === ChannelType.GuildText) {
                const categoryId = channel.parentId;
                if (categoryId && categorized[categoryId]) {
                    categorized[categoryId].channels.push({
                        name: channel.name,
                        id: channel.id,
                        type: 'TEXT'
                    });
                } else {
                    uncategorized.push({
                        name: channel.name,
                        id: channel.id,
                        type: 'TEXT'
                    });
                }
            }
        });

        // Display categories with their channels
        Object.values(categorized).forEach(category => {
            console.log(`📁 ${category.name}`);
            console.log(`   ID: ${category.id}`);
            category.channels.forEach(ch => {
                console.log(`   ├─ #${ch.name}`);
                console.log(`      ID: ${ch.id}`);
            });
            console.log();
        });

        // Display uncategorized channels
        if (uncategorized.length > 0) {
            console.log('📁 (No Category)');
            uncategorized.forEach(ch => {
                console.log(`   ├─ #${ch.name}`);
                console.log(`      ID: ${ch.id}`);
            });
            console.log();
        }

        // Summary export
        console.log('═════════════════════════════════════════════════');
        console.log('JSON EXPORT:\n');
        const output = {
            categories: Object.values(categorized),
            uncategorized: uncategorized
        };
        console.log(JSON.stringify(output, null, 2));

        process.exit(0);
    } catch (error) {
        console.error('Error fetching channels:', error);
        process.exit(1);
    }
});

client.login(process.env.BOT_TOKEN);
