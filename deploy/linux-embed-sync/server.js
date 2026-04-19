const fs = require('fs');
const path = require('path');
const express = require('express');

const app = express();

const PORT = Number(process.env.PORT || 8080);
const API_TOKEN = process.env.LINUX_SYNC_TOKEN || '';
const EMBEDS_FILE = process.env.EMBEDS_FILE || path.join(__dirname, 'embeds.json');

function unauthorized(res) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
}

function readEmbedsFile() {
    if (!fs.existsSync(EMBEDS_FILE)) {
        return { embeds: [] };
    }

    const raw = fs.readFileSync(EMBEDS_FILE, 'utf8');
    const json = JSON.parse(raw);

    if (!json || !Array.isArray(json.embeds)) {
        throw new Error('embeds.json must be an object with an embeds array');
    }

    return json;
}

app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'linux-embed-sync' });
});

app.get('/api/discord/embeds', (req, res) => {
    if (!API_TOKEN) {
        return res.status(500).json({ ok: false, error: 'LINUX_SYNC_TOKEN not configured on server' });
    }

    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${API_TOKEN}`) {
        return unauthorized(res);
    }

    try {
        const payload = readEmbedsFile();
        return res.json(payload);
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message || 'failed_to_read_embeds' });
    }
});

app.listen(PORT, () => {
    console.log(`linux-embed-sync listening on :${PORT}`);
    console.log(`embeds source: ${EMBEDS_FILE}`);
});
