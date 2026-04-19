'use strict';
const mongoose = require('mongoose');

const NowPlayingSchema = new mongoose.Schema({
    stationSlug:       { type: String, required: true, unique: true },
    trackIndex:        { type: Number, default: 0 },
    trackTitle:        { type: String, default: 'Unknown Track' },
    trackArtist:       { type: String, default: 'Unknown Artist' },
    trackUrl:          { type: String, default: '' },
    startedAt:         { type: Date,   default: Date.now },
    requestedBy:       { type: String, default: null },
    announceMessageId: { type: String, default: null },
    announceChannelId: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('NowPlaying', NowPlayingSchema);
