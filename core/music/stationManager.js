'use strict';

const mongoose    = require('mongoose');
const RadioStation = require('../../models/RadioStation');
const NowPlaying   = require('../../models/NowPlaying');

// In-memory fallback when DB is offline
const _memNowPlaying = new Map();

const DEFAULT_STATIONS = [
    {
        slug: 'midnight-fm', name: 'MIDNIGHT FM', icon: '🌙', color: 0x4a235a,
        description: 'Chill night drive — synthwave & lo-fi',
        shuffle: true, loop: true,
        tracks: [
            { title: 'Neon Drive',  artist: 'Midnight Pine',   url: '', durationSec: 240 },
            { title: 'After Hours', artist: 'Night Collective', url: '', durationSec: 210 },
            { title: 'Street Glow', artist: 'Synthwave Labs',   url: '', durationSec: 195 },
        ],
    },
    {
        slug: 'drift-fm', name: 'DRIFT FM', icon: '🔥', color: 0xe17055,
        description: 'Phonk & drift culture — hard bass',
        shuffle: true, loop: true,
        tracks: [
            { title: 'Phonk Mode',       artist: 'DRIFT.exe',       url: '', durationSec: 180 },
            { title: 'Slide Season',     artist: 'Yokohama Nights',  url: '', durationSec: 200 },
            { title: 'Tokyo Drift Tape', artist: 'VHS Phonk',        url: '', durationSec: 215 },
        ],
    },
    {
        slug: 'rush-fm', name: 'RUSH FM', icon: '⚡', color: 0x00cec9,
        description: 'High energy — trap, EDM, race-day anthems',
        shuffle: true, loop: true,
        tracks: [
            { title: 'Full Send',  artist: 'Rush Hour',      url: '', durationSec: 175 },
            { title: 'Red Zone',   artist: 'Adrenaline Cut', url: '', durationSec: 190 },
            { title: 'Hyperdrive', artist: 'NRG Collective', url: '', durationSec: 205 },
        ],
    },
];

async function seedDefaultStations() {
    if (mongoose.connection.readyState !== 1) return;
    for (const def of DEFAULT_STATIONS) {
        await RadioStation.findOneAndUpdate(
            { slug: def.slug },
            { $setOnInsert: def },
            { upsert: true, new: false },
        ).catch(() => null);
    }
    console.log('[music] Default stations seeded.');
}

async function listStations() {
    if (mongoose.connection.readyState !== 1) return DEFAULT_STATIONS;
    return RadioStation.find({}).lean();
}

async function getStation(slug) {
    if (mongoose.connection.readyState !== 1) {
        return DEFAULT_STATIONS.find((s) => s.slug === slug) || null;
    }
    return RadioStation.findOne({ slug }).lean();
}

async function addTrack(stationSlug, track) {
    const station = await RadioStation.findOne({ slug: stationSlug });
    if (!station) throw new Error(`Station "${stationSlug}" not found.`);
    station.tracks.push(track);
    await station.save();
    return station;
}

async function removeTrack(stationSlug, trackIndex) {
    const station = await RadioStation.findOne({ slug: stationSlug });
    if (!station) throw new Error(`Station "${stationSlug}" not found.`);
    if (trackIndex < 0 || trackIndex >= station.tracks.length) {
        throw new Error(`Track index ${trackIndex} out of range (0–${station.tracks.length - 1}).`);
    }
    station.tracks.splice(trackIndex, 1);
    await station.save();
    return station;
}

async function getCurrentTrack(stationSlug) {
    if (mongoose.connection.readyState !== 1) {
        return _memNowPlaying.get(stationSlug) || null;
    }
    return NowPlaying.findOne({ stationSlug }).lean();
}

async function setCurrentTrack(stationSlug, trackInfo) {
    const data = {
        stationSlug,
        trackTitle:  trackInfo.title  || 'Unknown Track',
        trackArtist: trackInfo.artist || 'Unknown Artist',
        trackUrl:    trackInfo.url    || '',
        trackIndex:  trackInfo.index  ?? 0,
        startedAt:   new Date(),
        requestedBy: trackInfo.requestedBy || null,
    };
    _memNowPlaying.set(stationSlug, data);
    if (mongoose.connection.readyState !== 1) return data;
    return NowPlaying.findOneAndUpdate(
        { stationSlug },
        { $set: data },
        { upsert: true, new: true },
    ).lean();
}

async function advanceTrack(stationSlug) {
    const station = await getStation(stationSlug);
    if (!station || !station.tracks.length) return null;
    const current = await getCurrentTrack(stationSlug);
    let nextIndex  = ((current?.trackIndex ?? -1) + 1) % station.tracks.length;
    if (station.shuffle) nextIndex = Math.floor(Math.random() * station.tracks.length);
    const track = station.tracks[nextIndex];
    return setCurrentTrack(stationSlug, { ...track, index: nextIndex });
}

module.exports = {
    seedDefaultStations,
    listStations,
    getStation,
    addTrack,
    removeTrack,
    getCurrentTrack,
    setCurrentTrack,
    advanceTrack,
    DEFAULT_STATIONS,
};
