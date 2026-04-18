'use strict';

/**
 * dedupe-categories.js
 * Merges duplicate Discord categories by normalized name,
 * moving channels into a canonical category and deleting extras.
 */

require('dotenv').config({ path: __dirname + '/.env' });
const { Client, GatewayIntentBits, ChannelType } = require('./node_modules/discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function normalizeCategoryName(name) {
    return name
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function pickCanonical(categories) {
    // Prefer the category with the most channels, then highest position.
    return [...categories].sort((a, b) => {
        const byChildren = (b.children?.cache?.size || 0) - (a.children?.cache?.size || 0);
        if (byChildren !== 0) return byChildren;
        return b.rawPosition - a.rawPosition;
    })[0];
}

client.once('clientReady', async () => {
    const guild = client.guilds.cache.get(process.env.HOME_GUILD_ID);
    if (!guild) {
        console.error('Guild not found from HOME_GUILD_ID');
        process.exit(1);
    }

    await guild.channels.fetch();

    const categories = guild.channels.cache
        .filter(c => c.type === ChannelType.GuildCategory)
        .map(c => c);

    const groups = new Map();
    for (const category of categories) {
        const key = normalizeCategoryName(category.name);
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(category);
    }

    let movedCount = 0;
    let deletedCount = 0;

    for (const [key, cats] of groups.entries()) {
        if (cats.length <= 1) continue;

        const canonical = pickCanonical(cats);
        const duplicates = cats.filter(c => c.id !== canonical.id);

        console.log(`Duplicate group: "${key}"`);
        console.log(`  keep:   ${canonical.name} (${canonical.id})`);

        for (const dup of duplicates) {
            console.log(`  merge:  ${dup.name} (${dup.id})`);

            const children = guild.channels.cache.filter(ch => ch.parentId === dup.id);
            for (const ch of children.values()) {
                await ch.setParent(canonical.id, { lockPermissions: false });
                movedCount++;
                console.log(`    moved channel: ${ch.name}`);
            }

            await dup.delete('Deduplicated category');
            deletedCount++;
            console.log('    deleted duplicate category');
        }
    }

    if (deletedCount === 0) {
        console.log('No duplicate categories found.');
    }

    console.log('');
    console.log(`Done. Channels moved: ${movedCount}, duplicate categories deleted: ${deletedCount}`);
    process.exit(0);
});

client.login(process.env.BOT_TOKEN);
