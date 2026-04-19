const mongoose = require('mongoose');

const leaderboardBanSchema = new mongoose.Schema(
    {
        discordId:      { type: String, required: true, unique: true, index: true },
        reason:         { type: String, default: '' },
        imposedBy:      { type: String, required: true },
        imposedAt:      { type: Date, default: () => new Date(), index: true },
        expiresAt:      { type: Date, default: null },
        active:         { type: Boolean, default: true, index: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model('LeaderboardBan', leaderboardBanSchema);
