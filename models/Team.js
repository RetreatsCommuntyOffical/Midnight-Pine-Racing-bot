const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema(
    {
        name:             { type: String, required: true, unique: true, index: true },
        captainDiscordId: { type: String, required: true },
        members:          [{ type: String }],
        totalPoints:      { type: Number, default: 0, index: true },
        weeklyPoints:     { type: Number, default: 0 },
        teamWins:         { type: Number, default: 0 },
        events:           { type: Number, default: 0 },
        iconUrl:          { type: String, default: null },
        bannerUrl:        { type: String, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Team', teamSchema);
