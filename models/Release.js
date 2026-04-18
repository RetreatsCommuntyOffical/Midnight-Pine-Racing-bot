const mongoose = require('mongoose');

const specSchema = new mongoose.Schema(
    { label: { type: String }, value: { type: String } },
    { _id: false }
);

const changeGroupSchema = new mongoose.Schema(
    { category: { type: String }, items: [{ type: String }] },
    { _id: false }
);

const releaseSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ['map', 'vehicle', 'update', 'sneak'],
            required: true,
            index: true,
        },
        title:       { type: String, required: true },
        description: { type: String, default: '' },
        imageUrl:    { type: String, default: null },

        // Map fields
        mapType:     { type: String, default: null },
        environment: { type: String, default: null },
        difficulty:  { type: String, default: null },

        // Vehicle fields
        vehicleClass:    { type: String, default: null },
        topSpeed:        { type: String, default: null },
        handling:        { type: String, default: null },
        vehicleCategory: { type: String, default: null },

        // Update fields
        version: { type: String, default: null },
        changes: [changeGroupSchema],

        // Shared
        specs:           [specSchema],
        pingRoleId:      { type: String, default: null },
        scheduledFor:    { type: Date, default: null, index: true },
        status:          { type: String, enum: ['draft', 'scheduled', 'live'], default: 'draft', index: true },
        postedMessageId: { type: String, default: null },
        postedChannelId: { type: String, default: null },
        createdByDiscordId: { type: String, required: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Release', releaseSchema);
