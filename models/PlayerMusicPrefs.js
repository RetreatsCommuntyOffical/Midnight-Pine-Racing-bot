'use strict';
const mongoose = require('mongoose');

const PlayerMusicPrefsSchema = new mongoose.Schema({
    discordId:   { type: String, required: true, unique: true },
    fivemId:     { type: String, default: null },
    stationSlug: { type: String, default: 'midnight-fm' },
    volume:      { type: Number, default: 50, min: 0, max: 100 },
    enabled:     { type: Boolean, default: true },
    updatedAt:   { type: Date,   default: Date.now },
});

module.exports = mongoose.model('PlayerMusicPrefs', PlayerMusicPrefsSchema);
