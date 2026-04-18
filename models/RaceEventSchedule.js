const mongoose = require('mongoose');

const raceEventScheduleSchema = new mongoose.Schema(
    {
        title:                { type: String, required: true },
        description:          { type: String, default: '' },
        startsAt:             { type: Date, required: true, index: true },
        createdByDiscordId:   { type: String, required: true },
        targetRoleId:         { type: String, default: null },
        channelId:            { type: String, default: null },
        remindersSentMinutes: [{ type: Number }],
        status:               { type: String, enum: ['scheduled', 'started', 'cancelled'], default: 'scheduled', index: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model('RaceEventSchedule', raceEventScheduleSchema);
