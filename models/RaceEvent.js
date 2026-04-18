const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema(
    {
        discordId:     { type: String },
        position:      { type: Number },
        dnf:           { type: Boolean, default: false },
        pointsAwarded: { type: Number, default: 0 },
        lapTimes:      [{ type: Number }],
    },
    { _id: false }
);

const raceEventSchema = new mongoose.Schema(
    {
        raceName:           { type: String, required: true, index: true },
        trackName:          { type: String, default: '' },
        season:             { type: String, default: 'S1' },
        status:             { type: String, enum: ['created', 'started', 'completed'], default: 'created', index: true },
        participants:       [{ type: String }],
        results:            [resultSchema],
        createdByDiscordId: { type: String, required: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model('RaceEvent', raceEventSchema);
