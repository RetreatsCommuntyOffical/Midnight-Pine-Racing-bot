const mongoose = require('mongoose');

const desktopPlayerSchema = new mongoose.Schema(
    {
        username:      { type: String, required: true, unique: true, index: true, trim: true, maxlength: 32 },
        totalTimeSec:  { type: Number, default: 0, min: 0 },
        sessionCount:  { type: Number, default: 0, min: 0 },
        lastSeenAt:    { type: Date,   default: null },
        // Run stats — updated by POST /desktop/run
        totalRuns:     { type: Number, default: 0, min: 0 },
        totalScore:    { type: Number, default: 0, min: 0 },
        bestScore:     { type: Number, default: 0, min: 0 },
        cleanRuns:     { type: Number, default: 0, min: 0 },
        lastRunAt:     { type: Date,   default: null },
        lastRunRoute:  { type: String, default: null, maxlength: 64 },
        lastRunHash:   { type: String, default: null, maxlength: 64 }, // dedup: score-route-clientTs
    },
    { timestamps: true }
);

module.exports = mongoose.model('DesktopPlayer', desktopPlayerSchema);
