'use strict';

/**
 * scripts/seed-the-circle.js
 * One-shot: creates "THE CIRCLE" team, sets Hank as captain + member,
 * then refreshes the Team Roster Board embed.
 *
 * Usage: node scripts/seed-the-circle.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const client   = require('../core/client');
const { loadCommands } = require('../core/commandHandler');
const { postOrUpdateTeamRoster } = require('../core/racing/teamRosterPoster');
const Team          = require('../models/Team');
const DriverProfile = require('../models/DriverProfile');

const HANK_ID   = process.env.OWNER_ID;          // 525442067875233792
const TEAM_NAME = 'THE CIRCLE';

async function seedTeam() {
    // ── 1. Connect to MongoDB ────────────────────────────────────────────────
    await mongoose.connect(process.env.MONGO_URI);
    console.log('[seed] MongoDB connected');

    // ── 2. Upsert team ───────────────────────────────────────────────────────
    let team = await Team.findOne({ name: TEAM_NAME });
    if (team) {
        console.log(`[seed] Team "${TEAM_NAME}" already exists — skipping insert`);
    } else {
        team = await Team.create({
            name:             TEAM_NAME,
            captainDiscordId: HANK_ID,
            members:          [HANK_ID],
            totalPoints:      0,
            weeklyPoints:     0,
            teamWins:         0,
            events:           0,
        });
        console.log(`[seed] Team "${TEAM_NAME}" created (id: ${team._id})`);
    }

    // ── 3. Link Hank's DriverProfile to the team ─────────────────────────────
    const profile = await DriverProfile.findOneAndUpdate(
        { discordId: HANK_ID },
        { $set: { teamId: team._id } },
        { upsert: false, new: true }
    );
    if (profile) {
        console.log(`[seed] Linked DriverProfile ${HANK_ID} → team ${team._id}`);
    } else {
        console.warn(`[seed] No DriverProfile found for ${HANK_ID} — team not linked to a profile yet`);
    }
}

async function main() {
    await seedTeam();

    // ── 4. Log into Discord and refresh the Roster Board ────────────────────
    loadCommands();
    await client.login(process.env.BOT_TOKEN);

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timed out waiting for Discord ready')), 30_000);

        client.once('clientReady', async () => {
            clearTimeout(timeout);
            try {
                const guild = client.guilds.cache.get(process.env.HOME_GUILD_ID) || client.guilds.cache.first();
                if (!guild) throw new Error('Guild not found');

                await postOrUpdateTeamRoster(client, guild);
                console.log('[seed] Team Roster Board updated');
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    });
}

main()
    .catch(err => {
        console.error('[seed] FAILED:', err.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await client.destroy().catch(() => null);
        await mongoose.disconnect().catch(() => null);
    });
