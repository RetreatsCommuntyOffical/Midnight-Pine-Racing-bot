const mongoose = require('mongoose');

const driverSnapshotSchema = new mongoose.Schema(
    {
        discordId:   { type: String },
        displayName: { type: String },
        totalPoints: { type: Number },
        tier:        { type: String },
        rank:        { type: Number },
    },
    { _id: false }
);

const teamSnapshotSchema = new mongoose.Schema(
    {
        name:        { type: String },
        totalPoints: { type: Number },
        teamWins:    { type: Number },
        rank:        { type: Number },
    },
    { _id: false }
);

const seasonArchiveSchema = new mongoose.Schema(
    {
        seasonTag:       { type: String, required: true, index: true },
        archivedAt:      { type: Date, default: Date.now },
        soloChampion:    { type: String, default: null },
        streetChampion:  { type: String, default: null },
        circuitChampion: { type: String, default: null },
        teamChampion:    { type: String, default: null },
        topDrivers:      [driverSnapshotSchema],
        topTeams:        [teamSnapshotSchema],
    },
    { timestamps: true }
);

module.exports = mongoose.model('SeasonArchive', seasonArchiveSchema);
