const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
    {
        discordId:      { type: String, required: true, index: true },
        type:           { type: String, enum: ['credit', 'debit'], required: true },
        amount:         { type: Number, required: true, min: 0 },
        source:         { type: String, required: true, index: true },
        reason:         { type: String, default: '' },
        balanceAfter:   { type: Number, required: true, min: 0 },
        metadata:       { type: Object, default: {} },
        idempotencyKey: { type: String, default: null, unique: true, sparse: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Transaction', transactionSchema);
