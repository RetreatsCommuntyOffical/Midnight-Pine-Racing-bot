const mongoose = require('mongoose');

const runSubmissionSchema = new mongoose.Schema(
    {
        discordId:       { type: String, required: true, index: true },
        sessionId:       { type: mongoose.Schema.Types.ObjectId, ref: 'RunSession', default: null },
        distanceMeters:  { type: Number, required: true },
        timeSurvivedSec: { type: Number, required: true },
        topSpeed:        { type: Number, required: true },
        crashes:         { type: Number, required: true },
        cleanRun:        { type: Boolean, required: true },
        proofUrl:        { type: String, default: null },
        clipUrl:         { type: String, default: null },
        adminVerifiedBy: { type: String, default: null },
        pointsAwarded:   { type: Number, required: true },
        antiCheatStatus: {
            type: String,
            enum: ['pending', 'verified', 'rejected'],
            default: 'pending',
            index: true,
        },
        mapName:     { type: String, default: null, index: true },
        vehicleName: { type: String, default: null, index: true },
    },
    { timestamps: true }
);

runSubmissionSchema.index({ createdAt: -1 });
runSubmissionSchema.index({ mapName: 1, topSpeed: -1 });
runSubmissionSchema.index({ vehicleName: 1, topSpeed: -1 });

module.exports = mongoose.model('RunSubmission', runSubmissionSchema);
