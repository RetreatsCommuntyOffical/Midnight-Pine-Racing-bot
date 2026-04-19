const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema(
    {
        discordId:       { type: String, required: true, unique: true, index: true },
        balance:         { type: Number, default: 0, min: 0, index: true },
        totalEarned:     { type: Number, default: 0, min: 0 },
        totalSpent:      { type: Number, default: 0, min: 0 },
        dailyStreak:     { type: Number, default: 0, min: 0 },
        lastDailyClaimAt:{ type: Date, default: null },
        lastPurchaseAt:  { type: Date, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Wallet', walletSchema);
