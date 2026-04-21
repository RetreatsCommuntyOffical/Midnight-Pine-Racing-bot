'use strict';
/**
 * One-off: set iconUrl + bannerUrl on the Circle Racing Team document.
 * Run once: node scripts/set-circle-racing-assets.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Team     = require('../models/Team');

const ICON_URL   = 'https://cdn.discordapp.com/attachments/1494964462573326477/1496054388429684747/the_circle_racing_team_logo.jpg';
const BANNER_URL = 'https://cdn.discordapp.com/attachments/1494964462573326477/1496054388156797058/the_circle_racing_team_banner.jpg';

// Match whatever the team was named in the DB (case-insensitive substring)
const TEAM_NAME_CONTAINS = 'circle';

async function main() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log('Connected.');

    const result = await Team.findOneAndUpdate(
        { name: { $regex: TEAM_NAME_CONTAINS, $options: 'i' } },
        { $set: { iconUrl: ICON_URL, bannerUrl: BANNER_URL } },
        { new: true }
    );

    if (!result) {
        console.error('No team matching "%s" found.', TEAM_NAME_CONTAINS);
        process.exit(1);
    }

    console.log('Updated team: %s', result.name);
    console.log('  iconUrl  :', result.iconUrl);
    console.log('  bannerUrl:', result.bannerUrl);

    await mongoose.disconnect();
    console.log('Done.');
}

main().catch((err) => { console.error(err); process.exit(1); });
