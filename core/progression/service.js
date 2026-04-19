const DriverProfile = require('../../models/DriverProfile');

function xpRequiredForLevel(level) {
    const l = Math.max(1, Number(level || 1));
    return 100 + ((l - 1) * 50);
}

async function awardXp({ discordId, amount, reason = '' }) {
    const xpToAdd = Math.max(0, Math.floor(Number(amount || 0)));
    if (!xpToAdd) {
        return { gained: 0, leveledUp: false, oldLevel: null, newLevel: null };
    }

    const profile = await DriverProfile.findOne({ discordId });
    if (!profile) {
        return { gained: 0, leveledUp: false, oldLevel: null, newLevel: null };
    }

    const oldLevel = Number(profile.level || 1);
    profile.level = oldLevel;
    profile.xp = Number(profile.xp || 0) + xpToAdd;
    profile.totalXpEarned = Number(profile.totalXpEarned || 0) + xpToAdd;

    while (profile.xp >= xpRequiredForLevel(profile.level)) {
        profile.xp -= xpRequiredForLevel(profile.level);
        profile.level += 1;
        profile.lastLevelUpAt = new Date();
    }

    await profile.save();

    return {
        gained: xpToAdd,
        reason,
        leveledUp: profile.level > oldLevel,
        oldLevel,
        newLevel: profile.level,
        currentXp: profile.xp,
        nextLevelAt: xpRequiredForLevel(profile.level),
    };
}

module.exports = {
    xpRequiredForLevel,
    awardXp,
};
