const mongoose = require('mongoose');

const challengeTemplateSchema = new mongoose.Schema(
    {
        key:            { type: String, required: true, unique: true, index: true },
        title:          { type: String, required: true },
        description:    { type: String, required: true },
        period:         { type: String, enum: ['daily', 'weekly'], required: true, index: true },
        metric:         { type: String, required: true, index: true },
        target:         { type: Number, required: true, min: 1 },
        rewardCoins:    { type: Number, default: 0, min: 0 },
        rewardXp:       { type: Number, default: 0, min: 0 },
        rewardRoleName: { type: String, default: null },
        active:         { type: Boolean, default: true, index: true },
        weight:         { type: Number, default: 1, min: 1 },
    },
    { timestamps: true }
);

module.exports = mongoose.model('ChallengeTemplate', challengeTemplateSchema);
