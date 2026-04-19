'use strict';
const mongoose = require('mongoose');

const TrackSchema = new mongoose.Schema({
    title:      { type: String, required: true },
    artist:     { type: String, default: 'Unknown Artist' },
    url:        { type: String, default: '' },
    durationSec:{ type: Number, default: 0 },
    addedBy:    { type: String, default: null },
    addedAt:    { type: Date,   default: Date.now },
}, { _id: false });

const RadioStationSchema = new mongoose.Schema({
    slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    name:        { type: String, required: true },
    description: { type: String, default: '' },
    color:       { type: Number, default: 0x4a235a },
    icon:        { type: String, default: '📻' },
    memberOnly:  { type: Boolean, default: false },
    shuffle:     { type: Boolean, default: true },
    loop:        { type: Boolean, default: true },
    tracks:      [TrackSchema],
}, { timestamps: true });

module.exports = mongoose.model('RadioStation', RadioStationSchema);
