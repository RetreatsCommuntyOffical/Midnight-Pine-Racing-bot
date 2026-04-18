'use strict';

const MAX_CHARS = 1800;

function toText(args) {
    return args
        .map((arg) => {
            if (arg instanceof Error) {
                return arg.stack || arg.message || String(arg);
            }
            if (typeof arg === 'string') return arg;
            try {
                return JSON.stringify(arg, null, 2);
            } catch {
                return String(arg);
            }
        })
        .join(' ');
}

function splitChunks(text, size = MAX_CHARS) {
    if (!text) return [];
    const out = [];
    for (let i = 0; i < text.length; i += size) {
        out.push(text.slice(i, i + size));
    }
    return out;
}

async function resolveChannel(client, channelId) {
    if (!channelId) return null;
    let channel = client.channels.cache.get(channelId) || null;
    if (!channel) {
        channel = await client.channels.fetch(channelId).catch(() => null);
    }
    if (!channel || !channel.isTextBased()) return null;
    return channel;
}

function installDiscordLogRelay(client, channelId) {
    if (!client || !channelId) return;

    const original = {
        log: console.log.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
    };

    const queue = [];
    let running = false;
    let inRelay = false;

    async function flushQueue() {
        if (running) return;
        running = true;
        const previousRelayState = inRelay;
        inRelay = true;
        try {
            const channel = await resolveChannel(client, channelId);
            if (!channel) return;

            while (queue.length > 0) {
                const item = queue.shift();
                await channel.send({ content: item }).catch(() => null);
            }
        } finally {
            inRelay = previousRelayState;
            running = false;
        }
    }

    function relay(level, args) {
        original[level](...args);
        if (!client.isReady() || inRelay) return;

        const text = toText(args);
        const label = level.toUpperCase();
        const lines = splitChunks(text);

        inRelay = true;
        try {
            const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            for (const line of lines) {
                queue.push(`\`[${ts}]\` **[${label}]** ${line}`);
            }
            flushQueue().catch(() => null);
        } finally {
            inRelay = false;
        }
    }

    console.log = (...args) => relay('log', args);
    console.info = (...args) => relay('info', args);
    console.warn = (...args) => relay('warn', args);
    console.error = (...args) => relay('error', args);

    original.log(`Discord log relay enabled for channel ${channelId}`);
}

module.exports = { installDiscordLogRelay };
