const DriverProfile  = require('../../models/DriverProfile');
const Team           = require('../../models/Team');
const SeasonArchive  = require('../../models/SeasonArchive');
const { getTierFromPoints } = require('./points');

async function archiveSeason(seasonTag) {
    const topDrivers = await DriverProfile.find({}).sort({ totalPoints: -1 }).limit(25);
    const topTeams   = await Team.find({}).sort({ totalPoints: -1 }).limit(10);

    const driverSnapshots = topDrivers.map((d, i) => ({
        discordId:   d.discordId,
        displayName: d.displayName,
        totalPoints: d.totalPoints,
        tier:        d.tier,
        rank:        i + 1,
    }));
    const teamSnapshots = topTeams.map((t, i) => ({
        name:        t.name,
        totalPoints: t.totalPoints,
        teamWins:    t.teamWins,
        rank:        i + 1,
    }));

    const [soloTop]    = await DriverProfile.find({}).sort({ totalPoints: -1 }).limit(1);
    const [streetTop]  = await DriverProfile.find({}).sort({ streetPoints: -1 }).limit(1);
    const [circuitTop] = await DriverProfile.find({}).sort({ circuitPoints: -1 }).limit(1);
    const [teamTop]    = await Team.find({}).sort({ totalPoints: -1 }).limit(1);

    const archive = await SeasonArchive.create({
        seasonTag,
        soloChampion:    soloTop?.discordId    || null,
        streetChampion:  streetTop?.discordId  || null,
        circuitChampion: circuitTop?.discordId || null,
        teamChampion:    teamTop?.name         || null,
        topDrivers:      driverSnapshots,
        topTeams:        teamSnapshots,
    });

    // Reset all season points
    await DriverProfile.updateMany({}, {
        $set: { totalPoints: 0, streetPoints: 0, circuitPoints: 0, weeklyPoints: 0, weeklyStreetPoints: 0, weeklyCircuitPoints: 0, teamContributionPoints: 0, tier: 'Rookie' },
    });
    await Team.updateMany({}, { $set: { totalPoints: 0, weeklyPoints: 0, teamWins: 0 } });

    return archive;
}

async function getSeasonHistory(limit = 10) {
    return SeasonArchive.find({}).sort({ archivedAt: -1 }).limit(limit);
}

module.exports = { archiveSeason, getSeasonHistory };
