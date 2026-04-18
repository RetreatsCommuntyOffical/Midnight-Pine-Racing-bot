const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { refreshAllLeaderboards } = require('../core/racing/leaderboardPoster');
const { postOrUpdateTeamRoster } = require('../core/racing/teamRosterPoster');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const BANNERS_DIR = path.join(ROOT, 'assets', 'banners');

const ACCEPTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

const FILE_HINTS = {
    SOLO_BOARD_BANNER_URL: ['solo-board', 'solo_board', 'solo board', 'solo'],
    STREET_BOARD_BANNER_URL: ['street-board', 'street_board', 'street board', 'street'],
    CIRCUIT_BOARD_BANNER_URL: ['circuit-board', 'circuit_board', 'circuit board', 'circuit'],
    TEAMS_BANNER_URL: ['team-board', 'team_board', 'team board', 'teams-board', 'teams board', 'team', 'teams'],
};

const BOARD_CHANNEL_NAMES = new Set([
    '🏆┃solo-board',
    '🏙️┃street-board',
    '🏁┃circuit-board',
    '👥┃team-board',
    '📋┃team-roster',
]);

function normalizeName(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveBannerFile(key) {
    if (!fs.existsSync(BANNERS_DIR)) {
        throw new Error(`Missing banners directory: ${BANNERS_DIR}`);
    }

    const hints = (FILE_HINTS[key] || []).map(normalizeName);
    const files = fs.readdirSync(BANNERS_DIR)
        .filter((name) => ACCEPTED_EXTENSIONS.has(path.extname(name).toLowerCase()));

    const exact = files.find((name) => hints.includes(normalizeName(path.parse(name).name)));
    if (exact) return exact;

    const partial = files.find((name) => {
        const base = normalizeName(path.parse(name).name);
        return hints.some((hint) => base.includes(hint));
    });
    if (partial) return partial;

    throw new Error(`Missing banner for ${key}. Add a .png/.jpg/.jpeg/.webp file in ${BANNERS_DIR} with a name containing one of: ${hints.join(', ')}`);
}

function loadEnvText() {
    return fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
}

function upsertEnvValue(envText, key, value) {
    const lines = envText.split(/\r?\n/);
    const idx = lines.findIndex((line) => line.startsWith(`${key}=`));
    if (idx >= 0) {
        lines[idx] = `${key}=${value}`;
    } else {
        lines.push(`${key}=${value}`);
    }
    return lines.join('\n');
}

function chooseUploadChannel(guild, configuredId) {
    if (configuredId) {
        const configured = guild.channels.cache.get(configuredId);
        if (configured && configured.isTextBased()) return configured;
    }

    const channels = [...guild.channels.cache.values()].filter((c) => c.isTextBased());

    const botLogs = channels.find((c) => c.name.toLowerCase().includes('bot-logs'));
    if (botLogs && !BOARD_CHANNEL_NAMES.has(botLogs.name)) return botLogs;

    const staffLogs = channels.find((c) => c.name.toLowerCase().includes('logs'));
    if (staffLogs && !BOARD_CHANNEL_NAMES.has(staffLogs.name)) return staffLogs;

    const fallback = channels.find((c) => !BOARD_CHANNEL_NAMES.has(c.name));
    return fallback || null;
}

async function uploadBanner(channel, key, filename) {
    const filePath = path.join(BANNERS_DIR, filename);
    if (!fs.existsSync(filePath)) {
        throw new Error(`Missing banner file: ${filePath}`);
    }

    const attachment = new AttachmentBuilder(filePath);
    const sent = await channel.send({
        content: `Uploading ${filename} for ${key}`,
        files: [attachment],
    });

    const first = sent.attachments.first();
    if (!first?.url) {
        throw new Error(`Upload succeeded but no URL was returned for ${filename}`);
    }

    return first.url;
}

async function run() {
    dotenv.config({ path: ENV_PATH });

    const {
        BOT_TOKEN,
        HOME_GUILD_ID,
        ASSET_UPLOAD_CHANNEL_ID,
    } = process.env;

    if (!BOT_TOKEN) throw new Error('Missing BOT_TOKEN in .env');
    if (!HOME_GUILD_ID) throw new Error('Missing HOME_GUILD_ID in .env');

    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

    try {
        await client.login(BOT_TOKEN);
        const guild = await client.guilds.fetch(HOME_GUILD_ID);
        await guild.channels.fetch();

        const uploadChannel = chooseUploadChannel(guild, ASSET_UPLOAD_CHANNEL_ID);
        if (!uploadChannel || !uploadChannel.isTextBased()) {
            throw new Error('Could not resolve upload channel. Set ASSET_UPLOAD_CHANNEL_ID in .env.');
        }
        console.log(`Using upload channel: ${uploadChannel.name} (${uploadChannel.id})`);

        let envText = loadEnvText();
        envText = upsertEnvValue(envText, 'ASSET_UPLOAD_CHANNEL_ID', uploadChannel.id);

        for (const key of Object.keys(FILE_HINTS)) {
            const filename = resolveBannerFile(key);
            const url = await uploadBanner(uploadChannel, key, filename);
            envText = upsertEnvValue(envText, key, url);
            console.log(`${key} -> ${url}`);
        }

        fs.writeFileSync(ENV_PATH, `${envText.trim()}\n`, 'utf8');
        console.log('.env updated with new banner URLs');

        delete require.cache[require.resolve('../core/racing/leaderboardPoster')];
        delete require.cache[require.resolve('../core/racing/teamRosterPoster')];

        const { refreshAllLeaderboards: refresh } = require('../core/racing/leaderboardPoster');
        const { postOrUpdateTeamRoster: refreshRoster } = require('../core/racing/teamRosterPoster');

        await refresh(client, guild);
        await refreshRoster(client, guild);
        console.log('Leaderboards and team roster refreshed with live banner URLs');
    } finally {
        client.destroy();
    }
}

run().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
