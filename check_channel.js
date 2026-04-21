const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

const CHANNEL_ID = '1494964462573326477';

client.once('clientReady', async () => {
    try {
        const channel = await client.channels.fetch(CHANNEL_ID);
        const result = {
            found: !!channel,
            isTextBased: channel ? channel.isTextBased() : false,
            messageCount: 0,
            imageCount: 0
        };

        if (channel && channel.isTextBased()) {
            const messages = await channel.messages.fetch({ limit: 10 });
            result.messageCount = messages.size;
            messages.forEach(msg => {
                // Check filename/url extension if contentType is missing due to intents
                msg.attachments.forEach(attachment => {
                    const isImage = (attachment.contentType && attachment.contentType.startsWith('image/')) ||
                                    (/\.(jpg|jpeg|png|webp|gif)$/i.test(attachment.name || attachment.url));
                    if (isImage) {
                        result.imageCount++;
                    }
                });
            });
        }
        console.log(JSON.stringify(result));
    } catch (error) {
        console.error(JSON.stringify({ error: error.message }));
    } finally {
        client.destroy();
    }
});

client.login(process.env.BOT_TOKEN);
