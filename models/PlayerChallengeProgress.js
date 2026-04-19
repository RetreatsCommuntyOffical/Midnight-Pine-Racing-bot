const mongoose = require('mongoose');

const playerChallengeProgressSchema = new mongoose.Schema(
    {
        discordId:      { type: String, required: true, index: true },
        challengeKey:   { type: String, required: true, index: true },
        period:         { type: String, enum: ['daily', 'weekly'], required: true, index: true },
        periodStart:    { type: Date, required: true, index: true },
        periodEnd:      { type: Date, required: true, index: true },
        metric:         { type: String, required: true, index: true },
        target:         { type: Number, required: true, min: 1 },
        progress:       { type: Number, default: 0, min: 0 },
        rewardCoins:    { type: Number, default: 0, min: 0 },
        rewardXp:       { type: Number, default: 0, min: 0 },
        rewardRoleName: { type: String, default: null },
        completed:      { type: Boolean, default: false, index: true },
        completedAt:    { type: Date, default: null },
        claimed:        { type: Boolean, default: false, index: true },
        claimedAt:      { type: Date, default: null },
    },
    { timestamps: true }
);

playerChallengeProgressSchema.index({ discordId: 1, challengeKey: 1, periodStart: 1 }, { unique: true });

module.exports = mongoose.model('PlayerChallengeProgress', playerChallengeProgressSchema);
