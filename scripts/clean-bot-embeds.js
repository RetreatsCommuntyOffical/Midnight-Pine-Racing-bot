'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const client = require('../core/client');

const DRY_RUN = process.argv.includes('--dry-run');
const UNPIN_ALL = process.argv.includes('--unpin-all');
const ONLY_CHANNEL = process.argv.find((arg) => arg.startsWith('--channel='))?.split('=')[1] || null;

async function cleanChannelEmbeds(channel, botUserId) {
    let before;
    let scanned = 0;
    let deleted = 0;

    for (let page = 0; page < 200; page++) {
        const batch = await channel.messages
            .fetch({ limit: 100, ...(before ? { before } : {}) })
            .catch(() => null);

        if (!batch || batch.size === 0) break;

        const msgs = [...batch.values()];
        scanned += msgs.length;

        for (const msg of msgs) {
            if (msg.author?.id !== botUserId) continue;
            if (!msg.embeds || msg.embeds.length === 0) continue;

            if (!DRY_RUN) {
                await msg.delete().catch(() => null);
            }
            deleted += 1;
        }

        before = msgs[msgs.length - 1]?.id;
        if (!before) break;
    }

    return { scanned, deleted };
}

async function unpinChannelMessages(channel) {
    const pins = await channel.messages.fetchPins().catch(() => null);
    if (!pins) return 0;

    let unpinned = 0;
    const pinArray = Array.isArray(pins) ? pins : (typeof pins.values === 'function' ? [...pins.values()] : []);
    
    for (const msg of pinArray) {
        if (!DRY_RUN) {
            await msg.unpin().catch(() => null);
        }
        unpinned += 1;
    }
    return unpinned;
}

async function main() {
    const token = String(process.env.BOT_TOKEN || '').trim();
    const homeGuildId = String(process.env.HOME_GUILD_ID || '').trim();

    if (!token) throw new Error('BOT_TOKEN missing in .env');
    if (!homeGuildId) throw new Error('HOME_GUILD_ID missing in .env');

    await client.login(token);

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timed out waiting for Discord ready event')), 30000);

        client.once('clientReady', async () => {
            clearTimeout(timeout);
            try {
                const guild = client.guilds.cache.get(homeGuildId) || client.guilds.cache.first();
                if (!guild) throw new Error('No guild found');

                const channels = guild.channels.cache
                    .filter((c) => c.isTextBased())
                    .filter((c) => !ONLY_CHANNEL || c.id === ONLY_CHANNEL)
                    .sort((a, b) => a.position - b.position);

                let totalScanned = 0;
                let totalDeleted = 0;
                let totalPinsRemoved = 0;

                for (const channel of channels.values()) {
                    const { scanned, deleted } = await cleanChannelEmbeds(channel, client.user.id);
                    totalScanned += scanned;
                    totalDeleted += deleted;
                    let unpinned = 0;

                    if (UNPIN_ALL) {
                        unpinned = await unpinChannelMessages(channel);
                        totalPinsRemoved += unpinned;
                    }

                    if (deleted > 0 || unpinned > 0) {
                        const parts = [`[clean-bot-embeds] #${channel.name}: deleted=${deleted} scanned=${scanned}`];
                        if (UNPIN_ALL) parts.push(`unpinned=${unpinned}`);
                        console.log(parts.join(' '));
                    }
                }

                console.log(`\nCLEAN_BOT_EMBEDS_COMPLETE channels=${channels.size} messages_deleted=${totalDeleted} unpin_all=${UNPIN_ALL} messages_unpinned=${totalPinsRemoved}`);
                process.exit(0);
            } catch (err) {
                reject(err);
            }
        });
    });
}

main().catch((err) => {
    console.error('clean-bot-embeds failed:', err.message);
    process.exit(1);
});