'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { connect } = require('../core/database');
const client = require('../core/client');
const { triggerDailyDigestNow } = require('../core/racing/dailyDigestService');

async function run() {
    const token = String(process.env.BOT_TOKEN || '').trim();
    if (!token) throw new Error('BOT_TOKEN is missing in .env');

    await connect();

    client.once('clientReady', async () => {
        try {
            const result = await triggerDailyDigestNow(client, { force: true });
            console.log('Daily digest posted:', result);
            await client.destroy();
            process.exit(0);
        } catch (err) {
            console.error('Failed to post daily digest:', err?.message || err);
            await client.destroy().catch(() => null);
            process.exit(1);
        }
    });

    await client.login(token);
}

run().catch((err) => {
    console.error('Fatal error:', err?.message || err);
    process.exit(1);
});
