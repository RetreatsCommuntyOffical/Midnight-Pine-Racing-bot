const mongoose = require('mongoose');

const adminAuditLogSchema = new mongoose.Schema(
    {
        action:      { type: String, required: true, index: true },
        targetId:    { type: String, required: true, index: true },
        actorId:     { type: String, required: true, index: true },
        reason:      { type: String, default: '' },
        metadata:    { type: Object, default: {} },
    },
    { timestamps: true }
);

module.exports = mongoose.model('AdminAuditLog', adminAuditLogSchema);
