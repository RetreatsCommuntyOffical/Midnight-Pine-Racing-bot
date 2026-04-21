const mongoose = require('mongoose');

const telemetryRunSchema = new mongoose.Schema(
    {
        source: { type: String, default: 'fallback', index: true },
        startedAt: { type: Date, required: true, index: true },
        endedAt: { type: Date, required: true, index: true },
        durationSec: { type: Number, required: true },
        score: { type: Number, required: true, index: true },
        maxSpeed: { type: Number, required: true },
        route: { type: String, default: 'Unrouted', index: true },
        avgSpeed: { type: Number, default: 0 },
        driftScoreEnd: { type: Number, required: true },
        maxCombo: { type: Number, default: 1 },
        comboEnd: { type: Number, default: 1 },
        clean: { type: Boolean, default: true, index: true },
        telemetrySnapshot: { type: Object, default: {} },
    },
    { timestamps: true },
);

telemetryRunSchema.index({ score: -1, endedAt: -1 });

module.exports = mongoose.model('TelemetryRun', telemetryRunSchema);
