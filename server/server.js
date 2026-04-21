const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const TelemetryRun = require('../models/TelemetryRun');

const app = express();
const PORT = Number(process.env.LIVE_STATUS_PORT || 3000);
const DB_URI = String(process.env.MONGO_URI || '').trim();
const BOT_TOKEN = String(process.env.BOT_TOKEN || '').trim();
const HOME_GUILD_ID = String(process.env.HOME_GUILD_ID || '').trim();
const STREET_BOARD_CHANNEL_ID = String(process.env.STREET_BOARD_CHANNEL_ID || '').trim();
const TELEMETRY_ADMIN_TOKEN = String(process.env.TELEMETRY_ADMIN_TOKEN || '').trim();
const TELEMETRY_LEADERBOARD_POSTS_ENABLED = String(process.env.TELEMETRY_LEADERBOARD_POSTS_ENABLED || 'true').toLowerCase() === 'true';
const TELEMETRY_LEADERBOARD_POST_INTERVAL_MS = Math.max(
  15000,
  Number(process.env.TELEMETRY_LEADERBOARD_POST_INTERVAL_SEC || 120) * 1000,
);
const TELEMETRY_LEADERBOARD_POST_MIN_SCORE = Math.max(
  0,
  Number(process.env.TELEMETRY_LEADERBOARD_POST_MIN_SCORE || 500),
);
let dbReady = false;
let posterClient = null;
let posterReady = false;
let lastLeaderboardPostAt = 0;
let lastLeaderboardSignature = '';

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());

let driftScore = 0;
let telemetryOnline = false;
let telemetrySource = 'none';
let lastUpdateTs = Date.now();

const routes = [
  {
    name: 'Midnight Highway',
    start: { x: 120, z: 450 },
    end: { x: 980, z: 2100 },
    radius: 50,
  },
  {
    name: 'Pine Loop',
    start: { x: -300, z: 800 },
    end: { x: 600, z: 1600 },
    radius: 50,
  },
];

let activeRoute = null;
let runStarted = false;

const runTracker = {
  active: false,
  startedAt: null,
  lastCleanTick: null,
  currentScore: 0,
  combo: 1,
  maxCombo: 1,
  driftScore: 0,
  clean: true,
  maxSpeed: 0,
  avgSpeedTotal: 0,
  samples: 0,
  bestScore: 0,
  lastRun: null,
  history: [],
  route: null,
};

const liveData = {
  speed: 0,
  rpm: 0,
  gear: 'N',
  lapTime: '00:00:000',
  position: 0,
  driftScore: 0,
  status: 'offline',
  players: 0,
  maxPlayers: 0,
  traffic: 0,
  crashes: 0,
  source: 'none',
  score: 0,
  combo: 1,
  maxCombo: 1,
  clean: true,
  avgSpeed: 0,
  positionX: 0,
  positionZ: 0,
  route: 'None',
  availableRoutes: routes.map((route) => route.name),
};

function getDistance(a, b) {
  return Math.sqrt(
    Math.pow(Number(a?.x || 0) - Number(b?.x || 0), 2)
      + Math.pow(Number(a?.z || 0) - Number(b?.z || 0), 2),
  );
}

function getWorldPosition(physics) {
  const source = physics?.worldPosition || physics?.world_position;
  if (Array.isArray(source) && source.length >= 3) {
    return {
      x: Number(source[0]) || 0,
      z: Number(source[2]) || 0,
    };
  }
  return { x: 0, z: 0 };
}

function toGearLabel(gearValue) {
  const numeric = Number(gearValue);
  if (!Number.isFinite(numeric)) return 'N';
  if (numeric <= 0) return 'N';
  return String(numeric);
}

function pickNumber(obj, keys, fallback = 0) {
  for (const key of keys) {
    const value = Number(obj?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

let latestPhysics = {};
let latestGraphics = {};

function applyUpdate() {
  telemetryOnline = true;

  const speed = pickNumber(latestPhysics, ['speedKmh', 'speed_kmh', 'speedKMH'], 0);
  const rpm = pickNumber(latestPhysics, ['rpms', 'rpm'], 0);
  const gear = pickNumber(latestPhysics, ['gear'], 0);
  const lapTime = String(latestGraphics?.currentTime || latestGraphics?.current_time || '00:00:000');
  const position = pickNumber(latestGraphics, ['position', 'carPosition'], 0);
  const slip = Math.abs(pickNumber(latestPhysics, ['slipAngle', 'slip_angle'], 0));
  const gForce = Math.abs(pickNumber(latestPhysics, ['gForce', 'gforce', 'g_force', 'accG'], 0));
  const worldPos = getWorldPosition(latestPhysics);

  liveData.speed = Math.max(0, Math.floor(speed));
  liveData.rpm = Math.max(0, Math.floor(rpm));
  liveData.gear = toGearLabel(gear);
  liveData.lapTime = String(lapTime);
  liveData.position = Math.max(0, Math.floor(position));
  liveData.positionX = Number(worldPos.x || 0);
  liveData.positionZ = Number(worldPos.z || 0);
  liveData.status = 'online';

  // Keep compatibility fields so existing frontend blocks do not regress.
  liveData.players = liveData.position > 0 ? 1 : 0;
  liveData.maxPlayers = 1;
  liveData.traffic = Math.min(100, Math.round((liveData.speed / 300) * 100));
  liveData.crashes = Math.min(999, Math.floor(liveData.driftScore / 250));
  liveData.source = telemetrySource;

  updateRunTracker({ slip, gForce, pos: worldPos, now: Date.now() });
}

function makeRunSnapshot(now) {
  const durationMs = runTracker.active && runTracker.startedAt ? Math.max(0, now - runTracker.startedAt) : 0;
  const avgSpeed = runTracker.samples > 0 ? runTracker.avgSpeedTotal / runTracker.samples : 0;
  return {
    active: runTracker.active,
    status: runTracker.active ? 'RUNNING' : 'IDLE',
    durationMs,
    durationSec: Math.floor(durationMs / 1000),
    currentScore: runTracker.currentScore,
    combo: runTracker.combo,
    maxCombo: runTracker.maxCombo,
    driftScore: runTracker.driftScore,
    clean: runTracker.clean,
    maxSpeed: runTracker.maxSpeed,
    avgSpeed: Math.round(avgSpeed),
    route: runTracker.route || null,
    official: !!runStarted,
    bestScore: runTracker.bestScore,
    lastRun: runTracker.lastRun,
    history: runTracker.history.slice(0, 10),
  };
}

function finishRun(now, { routeName = 'Unrouted' } = {}) {
  const durationMs = runTracker.startedAt ? Math.max(0, now - runTracker.startedAt) : 0;
  const completed = {
    endedAt: new Date(now).toISOString(),
    durationMs,
    durationSec: Math.floor(durationMs / 1000),
    score: Math.floor(runTracker.currentScore),
    comboEnd: Number(runTracker.combo.toFixed(2)),
    maxCombo: Number(runTracker.maxCombo.toFixed(2)),
    driftScore: Math.floor(runTracker.driftScore),
    clean: runTracker.clean,
    maxSpeed: runTracker.maxSpeed,
    avgSpeed: runTracker.samples > 0 ? Math.round(runTracker.avgSpeedTotal / runTracker.samples) : 0,
    route: routeName,
  };

  runTracker.lastRun = completed;
  runTracker.history.unshift(completed);
  runTracker.history = runTracker.history.slice(0, 20);
  runTracker.bestScore = Math.max(runTracker.bestScore, runTracker.currentScore);

  void persistTelemetryRun(completed);

  runTracker.active = false;
  runTracker.startedAt = null;
  runTracker.lastCleanTick = null;
  runTracker.currentScore = 0;
  runTracker.combo = 1;
  runTracker.maxCombo = 1;
  runTracker.driftScore = 0;
  runTracker.clean = true;
  runTracker.maxSpeed = 0;
  runTracker.avgSpeedTotal = 0;
  runTracker.samples = 0;
  runTracker.route = null;
  driftScore = 0;
  liveData.score = 0;
  liveData.combo = 1;
  liveData.maxCombo = 1;
  liveData.clean = true;
  liveData.avgSpeed = 0;
  liveData.driftScore = 0;
  liveData.route = 'None';
}

function invalidateRun() {
  runTracker.active = false;
  runTracker.startedAt = null;
  runTracker.lastCleanTick = null;
  runTracker.currentScore = 0;
  runTracker.combo = 1;
  runTracker.maxCombo = 1;
  runTracker.driftScore = 0;
  runTracker.clean = true;
  runTracker.maxSpeed = 0;
  runTracker.avgSpeedTotal = 0;
  runTracker.samples = 0;
  runTracker.route = null;

  driftScore = 0;
  liveData.score = 0;
  liveData.combo = 1;
  liveData.maxCombo = 1;
  liveData.clean = true;
  liveData.avgSpeed = 0;
  liveData.driftScore = 0;
  liveData.route = 'None';
}

async function persistTelemetryRun(completed) {
  if (!completed) return;
  const doc = {
    source: telemetrySource,
    startedAt: runTracker.startedAt ? new Date(runTracker.startedAt) : new Date(Date.now() - (completed.durationMs || 0)),
    endedAt: completed.endedAt ? new Date(completed.endedAt) : new Date(),
    durationSec: Number(completed.durationSec || 0),
    score: Number(completed.score || 0),
    maxSpeed: Number(completed.maxSpeed || 0),
    route: String(completed.route || 'Unrouted'),
    avgSpeed: Number(completed.avgSpeed || 0),
    driftScoreEnd: Number(completed.driftScore || 0),
    maxCombo: Number(completed.maxCombo || 1),
    comboEnd: Number(completed.comboEnd || 1),
    clean: !!completed.clean,
    telemetrySnapshot: {
      speed: Number(liveData.speed || 0),
      rpm: Number(liveData.rpm || 0),
      gear: String(liveData.gear || 'N'),
      position: Number(liveData.position || 0),
      positionX: Number(liveData.positionX || 0),
      positionZ: Number(liveData.positionZ || 0),
    },
  };

  if (dbReady) {
    try {
      await TelemetryRun.create(doc);
    } catch (firstErr) {
      // Single retry for transient Mongo errors (network blip, primary failover)
      const isTransient = firstErr?.name === 'MongoNetworkError'
        || firstErr?.name === 'MongoNetworkTimeoutError'
        || String(firstErr?.message || '').includes('ECONNRESET')
        || String(firstErr?.message || '').includes('timed out');

      if (isTransient) {
        console.warn('[run tracker] transient persist error, retrying once:', firstErr.message);
        await new Promise((resolve) => setTimeout(resolve, 800));
        try {
          await TelemetryRun.create(doc);
        } catch (retryErr) {
          console.error('[run tracker] persist retry failed:', retryErr?.message || retryErr);
        }
      } else {
        console.error('[run tracker] persist failed:', firstErr?.message || firstErr);
      }
    }
  }

  // Trigger immediate publish attempt on completed run.
  void postTelemetryLeaderboard('run_completed', { bypassCooldown: true });
}

function buildLeaderboardSignature(rows) {
  return (rows || [])
    .slice(0, 5)
    .map((row) => `${row.id}:${row.score}:${row.maxSpeed}:${row.durationSec}`)
    .join('|');
}

function createLeaderboardEmbed(rows, reason) {
  const lines = rows.slice(0, 5).map((row) => {
    const rank = Number(row.rank || 0);
    const score = Number(row.score || 0).toLocaleString();
    const speed = Number(row.maxSpeed || 0);
    const duration = Number(row.durationSec || 0);
    return `#${rank}  ${score} pts | ${speed} km/h | ${duration}s`;
  });

  return new EmbedBuilder()
    .setColor(0x4a235a)
    .setTitle('Midnight Pine Telemetry Runs')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `source=${dbReady ? 'mongo' : 'memory'} | trigger=${reason}` })
    .setTimestamp();
}

function isLoopbackAddress(address) {
  const addr = String(address || '').toLowerCase();
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function extractTelemetryAdminToken(req) {
  const authHeader = String(req.headers.authorization || '');
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  return String(req.headers['x-telemetry-admin-token'] || bearer || req.query.token || req.body?.token || '').trim();
}

function isTelemetryAdminAuthorized(req) {
  if (TELEMETRY_ADMIN_TOKEN) {
    const provided = extractTelemetryAdminToken(req);
    if (!provided || provided.length !== TELEMETRY_ADMIN_TOKEN.length) return false;
    return require('crypto').timingSafeEqual(Buffer.from(provided), Buffer.from(TELEMETRY_ADMIN_TOKEN));
  }
  return isLoopbackAddress(req.socket?.remoteAddress);
}

async function postTelemetryLeaderboard(reason = 'scheduled', options = {}) {
  const { bypassCooldown = false, dryRun = false } = options;

  if (!TELEMETRY_LEADERBOARD_POSTS_ENABLED) return { posted: false, reason: 'posting_disabled' };
  if (!posterReady || !posterClient) return { posted: false, reason: 'poster_not_ready' };
  if (!STREET_BOARD_CHANNEL_ID) return { posted: false, reason: 'missing_channel_id' };

  const now = Date.now();
  if (!bypassCooldown && now - lastLeaderboardPostAt < TELEMETRY_LEADERBOARD_POST_INTERVAL_MS) {
    return { posted: false, reason: 'cooldown_active' };
  }

  const rows = await getTopTelemetryRuns(5);
  if (!rows.length) return { posted: false, reason: 'no_rows' };
  if (Number(rows[0].score || 0) < TELEMETRY_LEADERBOARD_POST_MIN_SCORE) return { posted: false, reason: 'below_min_score' };

  const signature = buildLeaderboardSignature(rows);
  if (signature === lastLeaderboardSignature) return { posted: false, reason: 'unchanged' };

  if (dryRun) {
    return {
      posted: false,
      reason: 'dry_run',
      wouldPost: true,
      signature,
      topScore: Number(rows[0].score || 0),
    };
  }

  const channel = await posterClient.channels.fetch(STREET_BOARD_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return { posted: false, reason: 'channel_unavailable' };

  const embed = createLeaderboardEmbed(rows, reason);
  await channel.send({ embeds: [embed] });

  lastLeaderboardPostAt = now;
  lastLeaderboardSignature = signature;

  return {
    posted: true,
    reason: 'posted',
    signature,
    topScore: Number(rows[0].score || 0),
    rowsPosted: Math.min(5, rows.length),
  };
}

function initLeaderboardPoster() {
  if (!TELEMETRY_LEADERBOARD_POSTS_ENABLED) {
    console.log('[telemetry] leaderboard posting disabled by env.');
    return;
  }

  if (!BOT_TOKEN || !HOME_GUILD_ID || !STREET_BOARD_CHANNEL_ID) {
    console.warn('[telemetry] leaderboard posting unavailable; missing BOT_TOKEN, HOME_GUILD_ID, or STREET_BOARD_CHANNEL_ID.');
    return;
  }

  posterClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
    ],
  });

  posterClient.once('clientReady', async () => {
    posterReady = true;
    console.log(`[telemetry] leaderboard poster online as ${posterClient.user?.tag || 'unknown'}`);

    // Startup pass to prime signature without spamming duplicates.
    try {
      await postTelemetryLeaderboard('startup', { bypassCooldown: true });
    } catch (err) {
      console.warn('[telemetry] startup leaderboard post failed:', err?.message || err);
    }
  });

  posterClient.login(BOT_TOKEN).catch((err) => {
    console.error('[telemetry] leaderboard poster login failed:', err?.message || err);
  });

  setInterval(() => {
    void postTelemetryLeaderboard('scheduled', { bypassCooldown: false }).catch(() => null);
  }, TELEMETRY_LEADERBOARD_POST_INTERVAL_MS);
}

async function getTopTelemetryRuns(limit = 10) {
  const safeLimit = Math.max(1, Math.min(25, Number(limit) || 10));

  if (dbReady) {
    const rows = await TelemetryRun.find({})
      .sort({ score: -1, endedAt: -1 })
      .limit(safeLimit)
      .lean();

    return rows.map((row, idx) => ({
      rank: idx + 1,
      id: String(row._id),
      source: row.source || 'unknown',
      route: row.route || 'Unrouted',
      score: Number(row.score || 0),
      maxSpeed: Number(row.maxSpeed || 0),
      durationSec: Number(row.durationSec || 0),
      endedAt: row.endedAt,
    }));
  }

  return runTracker.history
    .slice(0, safeLimit)
    .map((row, idx) => ({
      rank: idx + 1,
      id: `memory-${idx + 1}`,
      source: telemetrySource,
      route: row.route || 'Unrouted',
      score: Number(row.score || 0),
      maxSpeed: Number(row.maxSpeed || 0),
      durationSec: Number(row.durationSec || 0),
      endedAt: row.endedAt,
    }))
    .sort((a, b) => b.score - a.score)
    .map((row, idx) => ({ ...row, rank: idx + 1 }));
}

async function getTopTelemetryRunsByRoute(routeName, limit = 10) {
  const safeLimit = Math.max(1, Math.min(25, Number(limit) || 10));
  const targetRoute = String(routeName || '').trim();

  if (!targetRoute) return [];

  if (dbReady) {
    const rows = await TelemetryRun.find({ route: targetRoute })
      .sort({ score: -1, endedAt: -1 })
      .limit(safeLimit)
      .lean();

    return rows.map((row, idx) => ({
      rank: idx + 1,
      id: String(row._id),
      source: row.source || 'unknown',
      route: row.route || targetRoute,
      score: Number(row.score || 0),
      maxSpeed: Number(row.maxSpeed || 0),
      durationSec: Number(row.durationSec || 0),
      endedAt: row.endedAt,
    }));
  }

  return runTracker.history
    .filter((row) => String(row.route || '') === targetRoute)
    .slice(0, safeLimit)
    .map((row, idx) => ({
      rank: idx + 1,
      id: `memory-${targetRoute}-${idx + 1}`,
      source: telemetrySource,
      route: row.route || targetRoute,
      score: Number(row.score || 0),
      maxSpeed: Number(row.maxSpeed || 0),
      durationSec: Number(row.durationSec || 0),
      endedAt: row.endedAt,
    }))
    .sort((a, b) => b.score - a.score)
    .map((row, idx) => ({ ...row, rank: idx + 1 }));
}

async function initDb() {
  if (!DB_URI) {
    console.warn('[telemetry] MONGO_URI not set; run persistence disabled.');
    return;
  }
  try {
    await mongoose.connect(DB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    dbReady = true;
    console.log('[telemetry] Mongo connected; run persistence enabled.');
  } catch (err) {
    dbReady = false;
    console.warn('[telemetry] Mongo connection failed; using in-memory run history only:', err?.message || err);
  }
}

function updateRunTracker({ slip = 0, gForce = 0, pos = { x: 0, z: 0 }, now = Date.now() }) {
  const speed = Number(liveData.speed || 0);
  const deltaSec = Math.max(0, Math.min(0.5, (now - lastUpdateTs) / 1000));
  lastUpdateTs = now;

  if (!runStarted) {
    const matchingRoute = routes.find((route) => {
      const distanceToStart = getDistance(pos, route.start);
      return distanceToStart <= route.radius && speed > 60;
    });

    if (matchingRoute) {
      activeRoute = matchingRoute;
      runStarted = true;
      runTracker.active = true;
      runTracker.startedAt = now;
      runTracker.lastCleanTick = now;
      runTracker.currentScore = 0;
      runTracker.combo = 1;
      runTracker.maxCombo = 1;
      runTracker.driftScore = 0;
      runTracker.clean = true;
      runTracker.maxSpeed = speed;
      runTracker.avgSpeedTotal = 0;
      runTracker.samples = 0;
      runTracker.route = matchingRoute.name;
      driftScore = 0;
      liveData.route = matchingRoute.name;
      console.log('[route] RUN STARTED:', matchingRoute.name);
    }
  }

  if (!runStarted || !runTracker.active || !activeRoute) {
    liveData.score = 0;
    liveData.combo = 1;
    liveData.maxCombo = 1;
    liveData.clean = true;
    liveData.avgSpeed = 0;
    liveData.driftScore = 0;
    liveData.route = 'None';
    liveData.run = makeRunSnapshot(now);
    return;
  }

  runTracker.samples += 1;
  runTracker.avgSpeedTotal += speed;

  runTracker.maxSpeed = Math.max(runTracker.maxSpeed, speed);

  if (speed > 80 && gForce < 2) {
    runTracker.combo += 0.02;
    runTracker.lastCleanTick = now;
  }

  if (speed > 70 && slip > 10) {
    const driftPoints = slip * 0.8;
    runTracker.driftScore += driftPoints;
    runTracker.currentScore += driftPoints * runTracker.combo;
  }

  if (speed > 100) {
    runTracker.currentScore += 0.5 * runTracker.combo;
  }

  if (gForce > 2 && gForce < 5) {
    runTracker.combo = Math.max(1, runTracker.combo * 0.98);
  }

  if (gForce > 5) {
    runTracker.combo = 1;
    runTracker.clean = false;
  }

  if (runTracker.combo > runTracker.maxCombo) {
    runTracker.maxCombo = runTracker.combo;
  }

  runTracker.currentScore += deltaSec * Math.max(0, speed - 40) * 0.15;

  driftScore = Math.floor(runTracker.driftScore);
  liveData.driftScore = driftScore;
  liveData.score = Math.floor(runTracker.currentScore);
  liveData.combo = Number(runTracker.combo.toFixed(2));
  liveData.maxCombo = Number(runTracker.maxCombo.toFixed(2));
  liveData.clean = runTracker.clean;
  liveData.avgSpeed = runTracker.samples > 0 ? Math.round(runTracker.avgSpeedTotal / runTracker.samples) : 0;
  liveData.route = activeRoute.name;

  const distanceToEnd = getDistance(pos, activeRoute.end);
  if (distanceToEnd <= activeRoute.radius) {
    console.log('[route] RUN COMPLETED:', activeRoute.name);
    finishRun(now, { routeName: activeRoute.name });
    runStarted = false;
    activeRoute = null;
    liveData.run = makeRunSnapshot(now);
    return;
  }

  if (speed < 10) {
    console.log('[route] RUN FAILED: speed dropped below threshold');
    runStarted = false;
    activeRoute = null;
    invalidateRun();
    liveData.run = makeRunSnapshot(now);
    return;
  }

  liveData.run = makeRunSnapshot(now);
}

function startMockTelemetry() {
  telemetrySource = 'fallback';
  liveData.source = telemetrySource;
  liveData.status = 'online';
  let tick = 0;
  let phase = 'run';
  let phaseTicks = 0;

  setInterval(() => {
    tick += 1;
    phaseTicks += 1;

    // Alternate between active run windows and cool-down windows so runs can complete.
    if (phase === 'run' && phaseTicks >= 320) {
      phase = 'cooldown';
      phaseTicks = 0;
    } else if (phase === 'cooldown' && phaseTicks >= 70) {
      phase = 'run';
      phaseTicks = 0;
    }

    const speed = phase === 'run'
      ? Math.max(0, Math.floor(120 + (Math.sin(tick / 8) * 55) + (Math.random() * 18)))
      : Math.max(0, Math.floor(2 + (Math.random() * 7)));
    const slip = phase === 'run'
      ? Math.max(0, Math.floor(8 + (Math.random() * 16)))
      : Math.max(0, Math.floor(Math.random() * 3));

    const gForce = phase === 'run'
      ? (Math.random() < 0.03 ? 5.2 + (Math.random() * 1.4) : 0.8 + (Math.random() * 2.4))
      : 0.3 + (Math.random() * 0.8);

    const activeMockRoute = routes[0];
    const segmentProgress = phase === 'run' ? Math.min(1, phaseTicks / 280) : 0;
    const posX = phase === 'run'
      ? activeMockRoute.start.x + ((activeMockRoute.end.x - activeMockRoute.start.x) * segmentProgress)
      : activeMockRoute.start.x + (Math.random() * 10);
    const posZ = phase === 'run'
      ? activeMockRoute.start.z + ((activeMockRoute.end.z - activeMockRoute.start.z) * segmentProgress)
      : activeMockRoute.start.z + (Math.random() * 10);

    liveData.speed = speed;
    liveData.rpm = Math.floor(1500 + (speed * 28));
    liveData.gear = toGearLabel(Math.max(1, Math.min(6, Math.floor((speed / 42) + 1))));
    liveData.position = 1;
    liveData.positionX = Number(posX.toFixed(2));
    liveData.positionZ = Number(posZ.toFixed(2));
    liveData.players = 1;
    liveData.maxPlayers = 1;
    liveData.traffic = Math.min(100, Math.round((liveData.speed / 300) * 100));
    liveData.crashes = Math.min(999, Math.floor(liveData.driftScore / 250));
    liveData.source = telemetrySource;
    updateRunTracker({
      slip,
      gForce,
      pos: { x: liveData.positionX, z: liveData.positionZ },
      now: Date.now(),
    });
  }, 100);
}

function startSharedMemoryTelemetry() {
  try {
    const { ACSharedMemClient, EventTypes } = require('ac-sharedmem-client');
    const client = new ACSharedMemClient();
    telemetrySource = 'shared_memory';
    liveData.source = telemetrySource;

    client.on(EventTypes.PHYSICS_UPDATE, (physicsInfo) => {
      latestPhysics = physicsInfo || {};
      applyUpdate();
    });

    client.on(EventTypes.GRAPHICS_UPDATE, (graphicsInfo) => {
      latestGraphics = graphicsInfo || {};
      applyUpdate();
    });

    setInterval(() => {
      if (!telemetryOnline) {
        liveData.status = 'offline';
      }
      telemetryOnline = false;
    }, 1500);

    client.init(100, 100, 1000);
    return true;
  } catch (err) {
    console.error('[AC telemetry] shared memory unavailable, enabling fallback feed:', err?.message || err);
    return false;
  }
}

if (!startSharedMemoryTelemetry()) {
  startMockTelemetry();
}

app.get('/api/telemetry', (req, res) => {
  res.json(liveData);
});

app.get('/api/run/current', (req, res) => {
  res.json(liveData.run || makeRunSnapshot(Date.now()));
});

app.get('/api/run/leaderboard', async (req, res) => {
  try {
    const rows = await getTopTelemetryRuns(req.query.limit);
    res.json({
      ok: true,
      source: dbReady ? 'mongo' : 'memory',
      rows,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || 'leaderboard_failed' });
  }
});

app.get('/api/leaderboard/:route', async (req, res) => {
  const routeName = String(req.params.route || '').trim();
  try {
    const runs = await getTopTelemetryRunsByRoute(routeName, req.query.limit || 10);
    res.json(runs);
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || 'route_leaderboard_failed' });
  }
});

app.post('/api/run/leaderboard/post', async (req, res) => {
  if (!isTelemetryAdminAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const dryRun = String(req.query.dryRun ?? req.body?.dryRun ?? 'false').toLowerCase() === 'true';
  const force = String(req.query.force ?? req.body?.force ?? 'true').toLowerCase() !== 'false';
  const reason = String(req.query.reason ?? req.body?.reason ?? 'manual').slice(0, 120);

  try {
    const result = await postTelemetryLeaderboard(`manual:${reason}`, {
      bypassCooldown: force,
      dryRun,
    });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || 'manual_post_failed' });
  }
});

app.get('/api/status', (req, res) => {
  res.json(liveData);
});

void initDb();
initLeaderboardPoster();

const httpServer = app.listen(PORT, () => {
  console.log(`AC Telemetry Running on http://localhost:${PORT}`);
});

httpServer.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.warn(`[telemetry] port ${PORT} already in use; assuming active instance is running.`);
    process.exit(0);
    return;
  }
  console.error('[telemetry] server startup failed:', err?.message || err);
  process.exit(1);
});
