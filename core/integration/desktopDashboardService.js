'use strict';

const { getLeaderboard } = require('../racing/service');
const Team = require('../../models/Team');
const DriverProfile = require('../../models/DriverProfile');
const DesktopPlayer = require('../../models/DesktopPlayer');

const SESSION_NAMES = {
    0: 'Booking',
    1: 'Practice',
    2: 'Qualifying',
    3: 'Race',
};

const SESSION_RISK_WEIGHT_DEFAULTS = {
    Booking: 0.8,
    Practice: 1.0,
    Qualifying: 1.15,
    Race: 1.3,
    Offline: 1.0,
};

function readEnvWeight(envName, fallback) {
    const raw = process.env[envName];
    if (raw === undefined || raw === null || raw === '') return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return clamp(parsed, 0.1, 3.0);
}

function loadSessionRiskWeights() {
    return {
        Booking: readEnvWeight('TRAFFIC_RISK_WEIGHT_BOOKING', SESSION_RISK_WEIGHT_DEFAULTS.Booking),
        Practice: readEnvWeight('TRAFFIC_RISK_WEIGHT_PRACTICE', SESSION_RISK_WEIGHT_DEFAULTS.Practice),
        Qualifying: readEnvWeight('TRAFFIC_RISK_WEIGHT_QUALIFYING', SESSION_RISK_WEIGHT_DEFAULTS.Qualifying),
        Race: readEnvWeight('TRAFFIC_RISK_WEIGHT_RACE', SESSION_RISK_WEIGHT_DEFAULTS.Race),
        Offline: readEnvWeight('TRAFFIC_RISK_WEIGHT_OFFLINE', SESSION_RISK_WEIGHT_DEFAULTS.Offline),
    };
}

let SESSION_RISK_WEIGHTS = loadSessionRiskWeights();

const DEFAULT_TIMEOUT_MS = 4500;

function getServerUrl(envKey) {
    return String(process.env[envKey] || '').trim();
}

function serverInfoUrl(baseUrl) {
    return `${baseUrl.replace(/\/$/, '')}/INFO`;
}

async function fetchJsonWithTimeout(targetUrl, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(targetUrl, { signal: controller.signal });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

async function fetchAcServerInfo(baseUrl) {
    if (!baseUrl) return null;
    return fetchJsonWithTimeout(serverInfoUrl(baseUrl));
}

function normalizeServerSnapshot(info, label) {
    if (!info) {
        return {
            label,
            online: false,
            players: 0,
            capacity: 0,
            session: 'Offline',
            track: null,
        };
    }

    return {
        label,
        online: true,
        players: Number(info.clients || 0),
        capacity: Number(info.maxclients || 0),
        session: SESSION_NAMES[Number(info.sessiontype)] || 'Practice',
        track: info.track || null,
    };
}

function readNumberField(obj, keys, fallback = 0) {
    for (const key of keys) {
        const value = Number(obj?.[key]);
        if (Number.isFinite(value)) return value;
    }
    return fallback;
}

function toSpeedBand(avgSpeed) {
    if (avgSpeed >= 95) return 'Extreme';
    if (avgSpeed >= 70) return 'High';
    if (avgSpeed >= 45) return 'Medium';
    if (avgSpeed > 0) return 'Low';
    return 'Unknown';
}

function toRiskLevel(crashes, players) {
    if (players <= 0) return 'Unknown';
    const ratio = crashes / players;
    if (ratio >= 1.5) return 'Critical';
    if (ratio >= 1.0) return 'High';
    if (ratio >= 0.5) return 'Elevated';
    return 'Stable';
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getSessionRiskWeight(sessionName) {
    return SESSION_RISK_WEIGHTS[sessionName] || 1.0;
}

function reloadTrafficRiskWeights() {
    SESSION_RISK_WEIGHTS = loadSessionRiskWeights();
    return { ...SESSION_RISK_WEIGHTS };
}

function getTrafficRiskWeightsSnapshot() {
    return { ...SESSION_RISK_WEIGHTS };
}

function computeRiskScore({ crashes, players, aiDensityPct, avgSpeed, sessionName }) {
    if (players <= 0) return 0;

    const crashPerPlayer = crashes / Math.max(1, players);
    const normalizedCrash = clamp(crashPerPlayer / 2, 0, 1);
    const normalizedSpeed = clamp(avgSpeed / 120, 0, 1);
    const normalizedDensity = clamp(aiDensityPct / 100, 0, 1);

    const composite = (normalizedCrash * 0.55) + (normalizedSpeed * 0.25) + (normalizedDensity * 0.20);
    const weighted = composite * getSessionRiskWeight(sessionName);
    return Math.round(clamp(weighted * 100, 0, 100));
}

function toRiskLevelFromScore(score) {
    if (score >= 80) return 'Critical';
    if (score >= 60) return 'High';
    if (score >= 35) return 'Elevated';
    if (score > 0) return 'Stable';
    return 'Unknown';
}

function normalizeTrafficMetrics(info, fallbackSnapshot) {
    if (!info) {
        return {
            aiDensityPct: 0,
            avgSpeed: 0,
            speedBand: 'Unknown',
            crashes: 0,
            riskScore: 0,
            riskLevel: 'Unknown',
            zone: fallbackSnapshot?.track || 'Unknown',
            sessionWeight: 1.0,
        };
    }

    const players = Number(info.clients || 0);
    const capacity = Math.max(0, Number(info.maxclients || 0));
    const aiDensityPct = readNumberField(info, ['aiDensity', 'ai_density', 'trafficDensity', 'traffic_density'], capacity > 0 ? Math.round((players / capacity) * 100) : 0);
    const avgSpeed = readNumberField(info, ['avgSpeed', 'averageSpeed', 'avg_speed', 'speed_avg'], 0);
    const crashes = Math.max(0, Math.round(readNumberField(info, ['crashes', 'totalCrashes', 'collisions', 'collisionCount'], 0)));
    const sessionName = SESSION_NAMES[Number(info.sessiontype)] || fallbackSnapshot?.session || 'Practice';
    const sessionWeight = getSessionRiskWeight(sessionName);
    const riskScore = computeRiskScore({ crashes, players, aiDensityPct, avgSpeed, sessionName });

    return {
        aiDensityPct: Math.max(0, Math.min(100, Math.round(aiDensityPct))),
        avgSpeed: Math.max(0, Math.round(avgSpeed)),
        speedBand: toSpeedBand(avgSpeed),
        crashes,
        riskScore,
        riskLevel: riskScore > 0 ? toRiskLevelFromScore(riskScore) : toRiskLevel(crashes, players),
        zone: info.zone || info.track || fallbackSnapshot?.track || 'Unknown',
        sessionWeight,
    };
}

function normalizeSoloRows(rows) {
    return rows.slice(0, 3).map((row, idx) => ({
        rank: idx + 1,
        driver: row.displayName || row.discordId || 'Unknown Driver',
        wins: Number(row.eventWins || row.teamWins || 0),
        points: Number(row.totalPoints || 0),
    }));
}

function normalizeTeamRows(rows) {
    return rows.slice(0, 3).map((row, idx) => ({
        rank: idx + 1,
        name: row.name || 'Unknown Team',
        points: Number(row.totalPoints || 0),
        wins: Number(row.teamWins || 0),
    }));
}

async function buildTeamDrilldown(teamRows) {
    const topTeams = Array.isArray(teamRows) ? teamRows.slice(0, 3) : [];
    const teamIds = topTeams.map((team) => team?._id).filter(Boolean);
    if (!teamIds.length) return [];

    const teams = await Team.find({ _id: { $in: teamIds } }).lean();
    const teamMap = new Map(teams.map((team) => [String(team._id), team]));

    const allMemberIds = [];
    for (const team of teams) {
        for (const memberId of team.members || []) {
            allMemberIds.push(memberId);
        }
    }

    const members = allMemberIds.length
        ? await DriverProfile.find({ discordId: { $in: allMemberIds } }).lean()
        : [];
    const memberMap = new Map(members.map((member) => [member.discordId, member]));

    return topTeams.map((team) => {
        const full = teamMap.get(String(team._id));
        if (!full) {
            return {
                rank: Number(team.rank || 0),
                name: team.name || 'Unknown Team',
                captainDiscordId: null,
                captainName: 'Unknown Captain',
                memberCount: 0,
                points: Number(team.points || 0),
                wins: Number(team.wins || 0),
                topMembers: [],
            };
        }

        const memberProfiles = (full.members || [])
            .map((discordId) => memberMap.get(discordId))
            .filter(Boolean)
            .sort((a, b) => Number(b.teamContributionPoints || b.totalPoints || 0) - Number(a.teamContributionPoints || a.totalPoints || 0));

        const captain = memberMap.get(full.captainDiscordId) || null;

        return {
            rank: Number(team.rank || 0),
            name: team.name || full.name || 'Unknown Team',
            captainDiscordId: full.captainDiscordId || null,
            captainName: captain?.displayName || full.captainDiscordId || 'Unknown Captain',
            memberCount: Array.isArray(full.members) ? full.members.length : 0,
            points: Number(team.points || full.totalPoints || 0),
            wins: Number(team.wins || full.teamWins || 0),
            topMembers: memberProfiles.slice(0, 3).map((profile) => ({
                discordId: profile.discordId,
                displayName: profile.displayName || profile.discordId,
                tier: profile.tier || 'Rookie',
                contribution: Number(profile.teamContributionPoints || 0),
                totalPoints: Number(profile.totalPoints || 0),
            })),
        };
    });
}

async function getDesktopOverview() {
    const mainUrl = getServerUrl('AC_SERVER_MAIN_URL');
    const trafficUrl = getServerUrl('AC_SERVER_TRAFFIC_URL');
    const driftUrl = getServerUrl('AC_SERVER_DRIFT_URL');
    const raceUrl = getServerUrl('AC_SERVER_RACE_URL');
    const nordUrl = getServerUrl('AC_SERVER_NORD_URL');

    const [mainInfo, trafficInfo, driftInfo, raceInfo, nordInfo, soloRows, teamRows, desktopTopRaw] = await Promise.all([
        fetchAcServerInfo(mainUrl),
        fetchAcServerInfo(trafficUrl),
        fetchAcServerInfo(driftUrl),
        fetchAcServerInfo(raceUrl),
        fetchAcServerInfo(nordUrl),
        getLeaderboard('solo', 3, false).catch(() => []),
        getLeaderboard('teams', 3, false).catch(() => []),
        DesktopPlayer.find({ totalRuns: { $gt: 0 } }).sort({ bestScore: -1 }).limit(10).lean().catch(() => []),
    ]);

    const server = normalizeServerSnapshot(mainInfo, 'Midnight Pine Racing');
    const traffic = normalizeServerSnapshot(trafficInfo, 'Traffic');
    const drift = normalizeServerSnapshot(driftInfo, 'Drift');
    const race = normalizeServerSnapshot(raceInfo, 'Race');
    const nord = normalizeServerSnapshot(nordInfo, 'Nordschleife');
    const trafficMetrics = normalizeTrafficMetrics(trafficInfo, traffic);
    const normalizedTeams = normalizeTeamRows(Array.isArray(teamRows) ? teamRows : []);
    const teamDrilldown = await buildTeamDrilldown(normalizedTeams).catch(() => []);

    const desktopLeaderboard = (Array.isArray(desktopTopRaw) ? desktopTopRaw : []).map((p, i) => ({
        rank:         i + 1,
        username:     p.username,
        bestScore:    p.bestScore   || 0,
        totalRuns:    p.totalRuns   || 0,
        cleanRuns:    p.cleanRuns   || 0,
        totalScore:   p.totalScore  || 0,
        lastRunRoute: p.lastRunRoute || null,
    }));

    return {
        generatedAt: new Date().toISOString(),
        server,
        traffic,
        sectors: {
            main: server,
            traffic,
            drift,
            race,
            nord,
        },
        trafficMetrics,
        leaderboard: normalizeSoloRows(Array.isArray(soloRows) ? soloRows : []),
        teams: normalizedTeams,
        teamDrilldown,
        desktopLeaderboard,
        message: 'Run it clean. No crashes. Midnight rules apply.',
    };
}

module.exports = {
    getDesktopOverview,
    reloadTrafficRiskWeights,
    getTrafficRiskWeightsSnapshot,
};
