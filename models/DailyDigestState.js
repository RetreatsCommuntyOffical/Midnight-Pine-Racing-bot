const mongoose = require('mongoose');

const dailyDigestStateSchema = new mongoose.Schema(
    {
        digestKey:      { type: String, required: true, unique: true, index: true },
        lastPostedDate: { type: String, default: null, index: true },
        lastPostedAt:   { type: Date, default: null },
        lockDate:       { type: String, default: null, index: true },
        lockExpiresAt:  { type: Date, default: null, index: true },
        lastRunAt:      { type: Date, default: null },
        lastError:      { type: String, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model('DailyDigestState', dailyDigestStateSchema);
