const mongoose = require('mongoose');

const membershipSchema = new mongoose.Schema(
    {
        discordId:             { type: String, required: true, unique: true, index: true },
        tier:                  { type: String, enum: ['none', 'bronze', 'silver', 'gold'], default: 'none', index: true },
        active:                { type: Boolean, default: false, index: true },
        source:                { type: String, default: 'manual' },
        purchaseRef:           { type: String, default: null },
        startsAt:              { type: Date, default: null },
        expiresAt:             { type: Date, default: null, index: true },
        xpBoostMultiplier:     { type: Number, default: 1, min: 1 },
        driftBoostMultiplier:  { type: Number, default: 1, min: 1 },
        syncedAt:              { type: Date, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Membership', membershipSchema);
