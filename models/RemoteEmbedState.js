const mongoose = require('mongoose');

const remoteEmbedStateSchema = new mongoose.Schema(
    {
        embedKey:     { type: String, required: true, unique: true, index: true },
        channelId:    { type: String, required: true, index: true },
        messageId:    { type: String, required: true },
        payloadHash:  { type: String, required: true },
        source:       { type: String, default: 'linux' },
        lastSyncedAt: { type: Date, default: () => new Date(), index: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model('RemoteEmbedState', remoteEmbedStateSchema);
