'use strict';

const mongoose        = require('mongoose');
const PlayerMusicPrefs = require('../../models/PlayerMusicPrefs');

const _memCache = new Map();
const DEFAULTS  = { stationSlug: 'midnight-fm', volume: 50, enabled: true };

async function getPrefs(discordId) {
    const fallback = { discordId, ...DEFAULTS };
    if (mongoose.connection.readyState !== 1) {
        return _memCache.get(discordId) || fallback;
    }
    return (await PlayerMusicPrefs.findOne({ discordId }).lean()) || fallback;
}

async function savePrefs(discordId, updates) {
    const current = _memCache.get(discordId) || { discordId, ...DEFAULTS };
    const merged  = { ...current, ...updates, discordId, updatedAt: new Date() };
    _memCache.set(discordId, merged);
    if (mongoose.connection.readyState !== 1) return merged;
    return PlayerMusicPrefs.findOneAndUpdate(
        { discordId },
        { $set: merged },
        { upsert: true, new: true },
    ).lean();
}

async function syncFromFiveM(fivemId, discordId, prefs) {
    if (!discordId) return null;
    return savePrefs(discordId, { fivemId, ...prefs });
}

module.exports = { getPrefs, savePrefs, syncFromFiveM };
