const mongoose = require('mongoose');

const runSessionSchema = new mongoose.Schema(
    {
        discordId: { type: String, required: true, index: true },
        startedAt: { type: Date, required: true },
        endedAt:   { type: Date, default: null },
        status:    { type: String, enum: ['active', 'ended', 'submitted'], default: 'active', index: true },
    },
    { timestamps: true }
);

runSessionSchema.index({ discordId: 1, status: 1 });

module.exports = mongoose.model('RunSession', runSessionSchema);
