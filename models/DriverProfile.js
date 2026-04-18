const mongoose = require('mongoose');

const driverProfileSchema = new mongoose.Schema(
    {
        discordId:              { type: String, required: true, unique: true, index: true },
        displayName:            { type: String, default: 'Unknown Driver' },

        // Points
        totalPoints:            { type: Number, default: 0, index: true },
        streetPoints:           { type: Number, default: 0, index: true },
        circuitPoints:          { type: Number, default: 0, index: true },
        weeklyPoints:           { type: Number, default: 0, index: true },
        weeklyStreetPoints:     { type: Number, default: 0 },
        weeklyCircuitPoints:    { type: Number, default: 0 },
        teamContributionPoints: { type: Number, default: 0 },

        // Tier
        tier: {
            type: String,
            enum: ['Rookie', 'Pro', 'Elite', 'Champion'],
            default: 'Rookie',
        },

        // Team ref
        teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },

        // No Hesi stats
        noHesiRuns:         { type: Number, default: 0 },
        cleanRuns:          { type: Number, default: 0 },
        cleanDriverRank:    { type: Number, default: 0 },
        noCrashStreak:      { type: Number, default: 0 },
        bestNoHesiDistance: { type: Number, default: 0 },
        bestNoHesiTopSpeed: { type: Number, default: 0 },

        // Race stats
        teamWins: { type: Number, default: 0 },
    },
    { timestamps: true }
);

module.exports = mongoose.model('DriverProfile', driverProfileSchema);
