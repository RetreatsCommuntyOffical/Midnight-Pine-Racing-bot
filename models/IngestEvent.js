const mongoose = require('mongoose');

const ingestEventSchema = new mongoose.Schema(
    {
        eventId:     { type: String, required: true, unique: true, index: true },
        eventType:   { type: String, required: true, index: true },
        discordId:   { type: String, required: true, index: true },
        accepted:    { type: Boolean, default: true, index: true },
        reason:      { type: String, default: '' },
        payload:     { type: Object, default: {} },
    },
    { timestamps: true }
);

module.exports = mongoose.model('IngestEvent', ingestEventSchema);
