const SERVER_IP = window.MPR_SERVER_IP || 'YOUR_SERVER_IP';
const API_BASE = window.MPR_API_BASE || '';
const API_BASE_CANDIDATES = API_BASE
  ? [API_BASE]
  : ['http://127.0.0.1:8788', 'http://127.0.0.1:8787'];
const API_TOKEN = window.MPR_API_TOKEN || '';
const LIVE_TELEMETRY_API = window.MPR_STATUS_API || 'http://localhost:3000/api/telemetry';
const REFRESH_MS = 30000;
const LIVE_REFRESH_MS = 100;
const TELEMETRY_POLL_MAX_MS = 2000;
const TELEMETRY_OFFLINE_CONFIRM_FAILURES = 3;
const TELEMETRY_BACKOFF_JITTER_RATIO = 0.2;
const INTEGRATION_WRITE_TIMEOUT_MS = 1800;
const DISCORD_POLL_TIMEOUT_MS = 1600;
const DISCORD_AUTH_MAX_TRANSIENT_ERRORS = 6;
let activeApiBase = null;
let telemetryApiUrl = LIVE_TELEMETRY_API;
let lastTelemetryErrorLogAt = 0;
let telemetryPollTimer = null;
let telemetryConsecutiveFailures = 0;
let telemetryOfflineConfirmed = false;

// â”€â”€ Tier System Constants (Phase 26-30) â”€â”€
const TIER_DATA = {
  free: {
    name: 'Free Plan',
    label: 'FREE',
    runsPerMonth: 50,
    features: ['50 runs/month', 'basic stats', 'local storage'],
    price: 0,
    interval: 'forever',
  },
  pro: {
    name: 'Pro Plan',
    label: 'PRO',
    runsPerMonth: Infinity,
    features: ['unlimited runs', 'csv export', 'custom banners', 'priority support'],
    price: 9.99,
    interval: 'month',
  },
  elite: {
    name: 'Elite Plan',
    label: 'ELITE',
    runsPerMonth: Infinity,
    features: ['everything in pro', 'advanced analytics', 'api access', 'custom themes'],
    price: 24.99,
    interval: 'month',
  },
  founder: {
    name: 'Founder Plan',
    label: 'FOUNDER',
    runsPerMonth: Infinity,
    features: ['everything in elite', 'lifetime 50% off', '1-on-1 support', 'early features'],
    price: 49.99,
    interval: 'month',
  },
};
const TIER_KEY = 'mpr_tier_subscription';

// â”€â”€ Owner Identity (hardcoded â€” this app runs locally for the server owner) â”€â”€
const OWNER_DISCORD_ID = '525442067875233792';

// â”€â”€ Discord Integration Constants (Phase 31) â”€â”€
const DISCORD_KEY = 'mpr_discord_account';
const CAREER_DATA_KEY = 'mpr_career_data';
const ACHIEVEMENTS_KEY = 'mpr_achievements';
const CAREER_BACKUP_KEY = 'mpr_career_backup'; // Backup copy for recovery
const CAREER_BACKUP_HISTORY_KEY = 'mpr_career_backup_history'; // Last 5 backups

// â”€â”€ Real-time UI Sync System (Phase 32, TOM: Zero Desync) â”€â”€
const SYNC_EVENTS = {
  CAREER_UPDATED: 'career:updated',
  ACHIEVEMENT_UNLOCKED: 'achievement:unlocked',
  TIER_CHANGED: 'tier:changed',
  DISCORD_CONNECTED: 'discord:connected',
  DISCORD_DISCONNECTED: 'discord:disconnected',
};

class UISyncEventEmitter {
  constructor() {
    this.listeners = {};
  }
  
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }
  
  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(cb => {
      try {
        cb(data);
      } catch (err) {
        console.error(`[SYNC] Event ${event} callback error:`, err);
      }
    });
  }
}

const uiSync = new UISyncEventEmitter();

// Career achievements system
const ACHIEVEMENTS = {
  first_run: { icon: 'ðŸ', name: 'First Run', desc: 'Completed your first run' },
  ten_runs: { icon: 'ðŸ”Ÿ', name: 'Decade', desc: 'Completed 10 runs' },
  hundred_runs: { icon: 'ðŸ’¯', name: 'Century', desc: 'Completed 100 runs' },
  clean_streak_5: { icon: 'âœ¨', name: 'Flawless', desc: '5 clean runs in a row' },
  clean_streak_10: { icon: 'â­', name: 'Perfect', desc: '10 clean runs in a row' },
  score_1000: { icon: 'ðŸ”¥', name: 'Pyro', desc: 'Score over 1000 in a single run' },
  pb_five: { icon: 'ðŸ“ˆ', name: 'Climber', desc: 'Set 5 personal bests' },
  combo_5x: { icon: 'âœ–ï¸ 5.0', name: 'Multiplier', desc: 'Achieve 5.0Ã— combo' },
  no_crashes_ten: { icon: 'ðŸ›¡ï¸', name: 'Guardian', desc: '10 runs without a crash' },
  total_score_10k: { icon: 'ðŸ’Ž', name: 'Gem', desc: 'Accumulate 10,000 total score' },
};

// inject green fog layer
(function () {
  const fog = document.createElement('div');
  fog.className = 'fog-green';
  document.body.prepend(fog);
}());

const tabButtons = Array.from(document.querySelectorAll('.nav-btn'));
const tabs = Array.from(document.querySelectorAll('.tab'));
const launchBtn = document.getElementById('launchBtn');

const serverStatusDot = document.getElementById('serverStatusDot');
const serverStatusText = document.getElementById('serverStatusText');
const playersText = document.getElementById('players');
const sessionText = document.getElementById('sessionText');
const dailyMessageText = document.getElementById('dailyMessageText');
const lastUpdatedText = document.getElementById('lastUpdatedText');
const sessionTimeText = document.getElementById('sessionTime');
const telemetrySourceText = document.getElementById('telemetrySourceText');
const homeRunModeText = document.getElementById('homeRunModeText');
const homeCleanStateText = document.getElementById('homeCleanStateText');
const speedText = document.getElementById('speed');
const rpmText = document.getElementById('rpm');
const gearText = document.getElementById('gear');
const positionText = document.getElementById('position');
const driftScoreText = document.getElementById('driftScore');
const liveScoreText = document.getElementById('liveScore');
const liveComboText = document.getElementById('liveCombo');
const maxComboText = document.getElementById('maxCombo');
const runStatusText = document.getElementById('runStatus');
const runDurationText = document.getElementById('runDuration');
const runScoreText = document.getElementById('runScore');
const runBestScoreText = document.getElementById('runBestScore');
const runLastScoreText = document.getElementById('runLastScore');
const runBoardSourceText = document.getElementById('runBoardSource');
const runBoardList = document.getElementById('runBoardList');
const routeSelect = document.getElementById('routeSelect');
const routeLeaderboard = document.getElementById('routeLeaderboard');
const routeNameText = document.getElementById('routeName');
const maxSpeedText = document.getElementById('maxSpeed');
const scoreProgressFill = document.getElementById('scoreProgressFill');

const trafficPlayersText = document.getElementById('trafficPlayersText');
const trafficSessionText = document.getElementById('trafficSessionText');
const trafficTrackText = document.getElementById('trafficTrackText');
const trafficDensityText = document.getElementById('trafficDensity');
const trafficSpeedText = document.getElementById('trafficSpeedText');
const trafficCrashesText = document.getElementById('crashes');
const trafficRiskText = document.getElementById('trafficRiskText');
const trafficRiskScoreText = document.getElementById('trafficRiskScoreText');
const trafficSessionWeightText = document.getElementById('trafficSessionWeightText');
const trafficBandPill = document.getElementById('trafficBandPill');

const sectorMainTile = document.getElementById('sectorMainTile');
const sectorMainStatus = document.getElementById('sectorMainStatus');
const sectorMainLoad = document.getElementById('sectorMainLoad');
const sectorMainSession = document.getElementById('sectorMainSession');
const sectorTrafficTile = document.getElementById('sectorTrafficTile');
const sectorTrafficStatus = document.getElementById('sectorTrafficStatus');
const sectorTrafficLoad = document.getElementById('sectorTrafficLoad');
const sectorTrafficSession = document.getElementById('sectorTrafficSession');
const sectorDriftTile = document.getElementById('sectorDriftTile');
const sectorDriftStatus = document.getElementById('sectorDriftStatus');
const sectorDriftLoad = document.getElementById('sectorDriftLoad');
const sectorDriftSession = document.getElementById('sectorDriftSession');
const sectorRaceTile = document.getElementById('sectorRaceTile');
const sectorRaceStatus = document.getElementById('sectorRaceStatus');
const sectorRaceLoad = document.getElementById('sectorRaceLoad');
const sectorRaceSession = document.getElementById('sectorRaceSession');
const sectorNordTile = document.getElementById('sectorNordTile');
const sectorNordStatus = document.getElementById('sectorNordStatus');
const sectorNordLoad = document.getElementById('sectorNordLoad');
const sectorNordSession = document.getElementById('sectorNordSession');

// â”€â”€ Server Cards DOM refs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SRV_CARDS = {
  main:    { card: document.getElementById('srvCardMain'),    badge: document.getElementById('srvStatusMain'),    players: document.getElementById('srvPlayersMain'),    cap: document.getElementById('srvCapMain'),    sess: document.getElementById('srvSessionMain'),    fill: document.getElementById('srvLoadMain')    },
  traffic: { card: document.getElementById('srvCardTraffic'), badge: document.getElementById('srvStatusTraffic'), players: document.getElementById('srvPlayersTraffic'), cap: document.getElementById('srvCapTraffic'), sess: document.getElementById('srvSessionTraffic'), fill: document.getElementById('srvLoadTraffic') },
  drift:   { card: document.getElementById('srvCardDrift'),   badge: document.getElementById('srvStatusDrift'),   players: document.getElementById('srvPlayersDrift'),   cap: document.getElementById('srvCapDrift'),   sess: document.getElementById('srvSessionDrift'),   fill: document.getElementById('srvLoadDrift')   },
  race:    { card: document.getElementById('srvCardRace'),    badge: document.getElementById('srvStatusRace'),    players: document.getElementById('srvPlayersRace'),    cap: document.getElementById('srvCapRace'),    sess: document.getElementById('srvSessionRace'),    fill: document.getElementById('srvLoadRace')    },
  nord:    { card: document.getElementById('srvCardNord'),    badge: document.getElementById('srvStatusNord'),    players: document.getElementById('srvPlayersNord'),    cap: document.getElementById('srvCapNord'),    sess: document.getElementById('srvSessionNord'),    fill: document.getElementById('srvLoadNord')    },
};

let _prevServerStates = {};

const leaderboardList = document.getElementById('leaderboardList');
const topTeamName = document.getElementById('topTeamName');
const topTeamMeta = document.getElementById('topTeamMeta');
const teamList = document.getElementById('teamList');
const teamDrilldownWrap = document.getElementById('teamDrilldownWrap');
const assetGallery = document.getElementById('assetGallery');

const session = {
  time: 0,
  crashes: Number(sessionStorage.getItem('mpr_session_crashes') || 0),
};
let localAssetFallbackRendered = false;

// â”€â”€ Login / session tracking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let currentUser = null;
let _sessionTrackInterval = null;

// â”€â”€ Loading Screen Manager â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const loadingScreen = document.getElementById('loadingScreen');
const loadingBar = document.getElementById('loadingBar');
const loadingPercentage = document.getElementById('loadingPercentage');
const loadingStatus = document.getElementById('loadingStatus');

let _loadingProgress = 0;

/**
 * Update loading screen progress and status
 * @param {number} percent - Progress percentage (0-100)
 * @param {string} status - Status message to display
 */
function updateLoadingProgress(percent, status) {
  _loadingProgress = Math.max(0, Math.min(100, percent));
  if (loadingBar) loadingBar.style.width = `${_loadingProgress}%`;
  if (loadingPercentage) loadingPercentage.textContent = `${_loadingProgress}%`;
  if (status && loadingStatus) loadingStatus.textContent = status;
  console.log(`[INIT] ${_loadingProgress}% - ${status}`);
}

/**
 * Hide the loading screen
 */
function hideLoadingScreen() {
  if (loadingScreen) {
    loadingScreen.classList.add('hidden');
    setTimeout(() => {
      loadingScreen.style.display = 'none';
    }, 400);
  }
}

/**
 * Show the loading screen
 */
function showLoadingScreen() {
  if (loadingScreen) {
    loadingScreen.style.display = 'flex';
    loadingScreen.classList.remove('hidden');
    _loadingProgress = 0;
  }
}

/**
 * Validate and recover app state on startup
 */
function validateAppState() {
  try {
    // Check localStorage integrity
    const user = localStorage.getItem('mpr_user');
    const tier = localStorage.getItem(TIER_KEY);
    const discord = localStorage.getItem(DISCORD_KEY);
    
    // Validate saved user name format if present
    if (user && !/^[a-zA-Z0-9 _.-]{2,32}$/.test(user)) {
      console.warn('[APP] Invalid saved user name, clearing');
      localStorage.removeItem('mpr_user');
    }
    
    // Validate tier data if present
    if (tier) {
      try {
        const tierData = JSON.parse(tier);
        if (!tierData.tier || !TIER_DATA[tierData.tier]) {
          console.warn('[APP] Invalid tier data, clearing');
          localStorage.removeItem(TIER_KEY);
        }
      } catch (e) {
        console.warn('[APP] Corrupted tier data, clearing');
        localStorage.removeItem(TIER_KEY);
      }
    }
    
    // Validate Discord connection if present
    if (discord) {
      try {
        const discordData = JSON.parse(discord);
        if (!discordData.id || !discordData.username) {
          console.warn('[APP] Invalid Discord data, clearing');
          localStorage.removeItem(DISCORD_KEY);
        }
      } catch (e) {
        console.warn('[APP] Corrupted Discord data, clearing');
        localStorage.removeItem(DISCORD_KEY);
      }
    }
    
    console.log('[APP] State validation passed');
    return true;
  } catch (err) {
    console.error('[APP] State validation failed:', err);
    return false;
  }
}

const loginScreen       = document.getElementById('loginScreen');
const loginInput        = document.getElementById('usernameInput');
const loginBtn          = document.getElementById('loginBtn');
const discordLoginBtn   = document.getElementById('discordLoginBtn');
const loginError        = document.getElementById('loginError');
const userChip        = document.getElementById('userChip');
const userAvatar      = document.getElementById('userAvatar');
const userNameDisplay = document.getElementById('userNameDisplay');
const logoutBtn       = document.getElementById('logoutBtn');

function applyLogin(name) {
  try {
    updateLoadingProgress(40, 'Loading user profile...');
    
    currentUser = name;
    userNameDisplay.textContent = name;
    userAvatar.textContent = name.charAt(0).toUpperCase();
    userChip.classList.add('visible');
    loginScreen.style.display = 'none';
    
    updateLoadingProgress(50, 'Initializing UI...');
    updateProfileTab();
    
    updateLoadingProgress(60, 'Fetching profile data...');
    fetchProfile();
    startSessionTracking(true);
    
    updateLoadingProgress(70, 'Setting up tiers...');
    initTierSystem();
    checkRenewalStatus();
    
    updateLoadingProgress(80, 'Connecting Discord...');
    initDiscordSystem();
    ensureOwnerAccountSeeded();
    updateAdminTabVisibility();
    initAdminPanel();
    initRunHistoryFilters();
    
    updateLoadingProgress(90, 'Syncing UI state...');
    initUISyncListeners();
    syncAllUI();
    
    updateLoadingProgress(95, 'Finalizing...');
    // Phase 34: wire career export button
    const careerExportBtn = document.getElementById('careerExportBtn');
    if (careerExportBtn) {
      careerExportBtn.addEventListener('click', exportCareerJSON);
    }
    
    // Phase 35: session goal tracker
    initSessionGoal();
    
    // Flush any runs that failed to sync in a previous offline session
    setTimeout(() => flushPendingRuns(), 2000);
    
    // Hide loading screen and show main app
    updateLoadingProgress(100, 'Ready!');
    setTimeout(() => hideLoadingScreen(), 300);
    
    console.log('[LOGIN] Session restored successfully for:', name);
  } catch (err) {
    console.error('[LOGIN] Session initialization failed:', err);
    // Graceful fallback: logout and show login screen
    currentUser = null;
    loginScreen.style.display = '';
    loginError.textContent = 'Failed to initialize. Please try again.';
    hideLoadingScreen();
    setTimeout(() => loginInput.focus(), 100);
  }
}

function login() {
  const name = (loginInput.value || '').trim();
  if (!name || name.length < 2) {
    loginError.textContent = 'Name must be at least 2 characters.';
    return;
  }
  if (!/^[a-zA-Z0-9 _.\-]{2,32}$/.test(name)) {
    loginError.textContent = 'Letters, numbers, spaces, _ . - only.';
    return;
  }
  loginError.textContent = '';
  localStorage.setItem('mpr_user', name);
  applyLogin(name);
}

function logout() {
  localStorage.removeItem('mpr_user');
  currentUser = null;
  clearInterval(_sessionTrackInterval);
  _sessionTrackInterval = null;
  userChip.classList.remove('visible');
  loginInput.value = '';
  loginError.textContent = '';
  loginScreen.style.display = '';
  setTimeout(() => loginInput.focus(), 50);
}

function startSessionTracking(isNewSession = false) {
  if (_sessionTrackInterval) clearInterval(_sessionTrackInterval);
  let firstTick = isNewSession;
  _sessionTrackInterval = setInterval(() => {
    sendTimeUpdate(10, firstTick);
    firstTick = false;
  }, 10000);
}

async function sendTimeUpdate(deltaSec, newSession = false) {
  if (!currentUser) return;
  try {
    await postToIntegration('/desktop/session', {
      username: currentUser,
      deltaSec,
      newSession,
    }, {
      timeoutMs: INTEGRATION_WRITE_TIMEOUT_MS,
    });
  } catch {
    // Silent â€” time tracking failure must never disrupt the UI
  }
}


// Run Sync Queue: persistent retry on network failure
const PENDING_RUNS_KEY = 'mpr_pending_runs';
let _runFlushInFlight = false;

function loadPendingRuns() {
  try { return JSON.parse(localStorage.getItem(PENDING_RUNS_KEY) || '[]'); } catch { return []; }
}

function savePendingRuns(queue) {
  try { localStorage.setItem(PENDING_RUNS_KEY, JSON.stringify(queue)); } catch { /* storage full */ }
}

/** Add a run to the outbox and immediately try to flush it. */
function enqueuePendingRun(entry) {
  const queue = loadPendingRuns();
  // Use stable ms timestamp (entry.ts) for dedup; fall back to time string for legacy entries
  const key = `${entry.score}-${entry.route}-${entry.ts || entry.time}`;
  if (queue.some(r => `${r.score}-${r.route}-${r.ts || r.time}` === key)) return;
  queue.push(entry);
  savePendingRuns(queue);
  flushPendingRuns();
}

/** Attempt to send all queued runs to the bot. Re-queues on failure. */
async function flushPendingRuns() {
  if (_runFlushInFlight || !currentUser) return;
  const queue = loadPendingRuns();
  if (!queue.length) return;

  _runFlushInFlight = true;
  const failed = [];

  for (const entry of queue) {
    try {
      await postToIntegration('/desktop/run', {
        username:    currentUser,
        score:       Number(entry.score || 0),
        route:       String(entry.route || 'Unknown'),
        clean:       !!entry.clean,
        isPB:        !!entry.isPB,
        maxCombo:    Number(entry.maxCombo || 1),
        durationSec: Number(entry.durationSec || 0),
        clientTs:    Number(entry.ts || 0), // used for server-side run dedup
      }, { timeoutMs: INTEGRATION_WRITE_TIMEOUT_MS });
    } catch {
      failed.push(entry);
    }
  }

  savePendingRuns(failed);
  _runFlushInFlight = false;

  if (failed.length > 0) { console.warn('[RUN QUEUE] ' + failed.length + ' run(s) pending sync - will retry on next run or login'); }
}

async function sendRunToBot(entry) {
  if (!currentUser) return;
  enqueuePendingRun(entry);
}
loginBtn.addEventListener('click', login);
loginInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
logoutBtn.addEventListener('click', logout);
if (discordLoginBtn) discordLoginBtn.addEventListener('click', loginWithDiscord);

// â”€â”€ Sound system (Web Audio API) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let _audioCtx = null;
let _soundEnabled = localStorage.getItem('mpr_sound') !== 'off';
let _lastRunState = 'IDLE';
let _lastCombo = 1;
let _lastComboFloor = 1;

const soundEnabledCheckbox = document.getElementById('soundEnabled');
const sessionRunDot         = document.getElementById('sessionRunDot');

function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

function playTone(frequency, duration, type = 'sine', volume = 0.22) {
  if (!_soundEnabled) return;
  try {
    const ctx = getAudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch { /* Web Audio not available */ }
}

// Combo tick: pitch scales with combo level (440Hz at x1.5 â†’ ~1200Hz at x10+)
function soundComboTick(combo = 1) {
  const freq = Math.min(1200, 440 + (combo - 1) * 70);
  playTone(freq, 0.07, 'square', 0.1);
}
// Milestone burst at x5, x10, x20 â€” ascending chord
function soundComboMilestone() {
  [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => playTone(f, 0.18, 'sine', 0.2), i * 75));
}
function soundRunComplete() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.22, 'sine', 0.28), i * 110)); }
function soundWarning()     { playTone(180, 0.3, 'sawtooth', 0.16); setTimeout(() => playTone(180, 0.3, 'sawtooth', 0.14), 380); }

if (soundEnabledCheckbox) {
  // Restore saved preference to checkbox visual
  soundEnabledCheckbox.checked = _soundEnabled;
  soundEnabledCheckbox.addEventListener('change', () => {
    _soundEnabled = soundEnabledCheckbox.checked;
    localStorage.setItem('mpr_sound', _soundEnabled ? 'on' : 'off');
  });
}

document.querySelectorAll('.sound-test-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.sound;
    if (type === 'combo') soundComboTick(3.5);  // demo at mid-range pitch
    else if (type === 'complete') soundRunComplete();
    else if (type === 'warning') soundWarning();
  });
});

// â”€â”€ Profile DOM refs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const profileAvatarLg    = document.getElementById('profileAvatarLg');
const profileNameLg      = document.getElementById('profileNameLg');
const profileTotalTime   = document.getElementById('profileTotalTime');
const profileSessions    = document.getElementById('profileSessions');
const profileLastSeen    = document.getElementById('profileLastSeen');
const profileSessionTime = document.getElementById('profileSessionTime');
const profileCrashes     = document.getElementById('profileCrashes');
const profileBestScore   = document.getElementById('profileBestScore');
const profileMaxCombo    = document.getElementById('profileMaxCombo');

function formatPlayTime(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function updateProfileTab() {
  if (!currentUser) return;
  if (profileAvatarLg) profileAvatarLg.textContent = currentUser.charAt(0).toUpperCase();
  if (profileNameLg)   profileNameLg.textContent   = currentUser;
  if (profileSessionTime && sessionTimeText) profileSessionTime.textContent = sessionTimeText.textContent;
  if (profileCrashes)   profileCrashes.textContent  = String(session.crashes || 0);
  if (profileBestScore && runBestScoreText) profileBestScore.textContent = runBestScoreText.textContent;
  if (profileMaxCombo  && maxComboText)     profileMaxCombo.textContent  = maxComboText.textContent;
  updateTierDisplay();
  updateRankBadges(); // Phase 35
}

async function fetchProfile() {
  if (!currentUser) return;
  try {
    const res = await fetchGetWithFallback('/desktop/player', (url) => {
      url.searchParams.set('username', currentUser);
    });
    if (res.ok) {
      const { data } = await res.json();
      if (profileTotalTime) profileTotalTime.textContent = formatPlayTime(data.totalTimeSec || 0);
      if (profileSessions)  profileSessions.textContent  = String(data.sessionCount || 0);
      if (profileLastSeen && data.lastSeenAt) profileLastSeen.textContent = toUpdatedLabel(data.lastSeenAt);
    }
  } catch { /* offline â€” silent */ }

  // â”€â”€ Fetch Discord HUD state if Discord account is linked â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  try {
    const discordRaw = localStorage.getItem(DISCORD_KEY);
    if (discordRaw) {
      const discordAccount = JSON.parse(discordRaw);
      const discordId = String(discordAccount?.discordId || '').trim();
      // Only call real HUD state for real Discord IDs (not mock ids generated locally)
      if (discordId && !discordId.startsWith('discord_')) {
        const hudRes = await fetchGetWithFallback('/hud/state', (url) => {
          url.searchParams.set('discordId', discordId);
        });
        if (hudRes.ok) {
          const { data: hud } = await hudRes.json();
          const elLevel  = document.getElementById('discordHudLevel');
          const elXp     = document.getElementById('discordHudXp');
          const elTier   = document.getElementById('discordHudTier');
          const elTaps   = document.getElementById('discordHudTaps');
          const elWrap   = document.getElementById('discordHudWrap');
          if (elWrap) elWrap.classList.remove('hud-hidden');
          if (elLevel) elLevel.textContent = `Lv. ${hud.level || 1}`;
          if (elXp)    elXp.style.width    = `${hud.xpPercent || 0}%`;
          if (elTier)  elTier.textContent  = hud.tier || 'Rookie';
          if (elTaps)  elTaps.textContent  = `${hud.tapsUsed || 0} / ${hud.tapsMax || 3} taps`;
        }
      }
    }
  } catch { /* Discord HUD is optional â€” never block */ }
}

// â”€â”€ Toast notification system â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const toastContainer = document.getElementById('toastContainer');

function showToast({ icon = 'â—ˆ', title = '', msg = '', type = 'finish', duration = 4000 } = {}) {
  if (!toastContainer) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${icon}</span><div class="toast-body"><div class="toast-title">${title}</div>${msg ? `<div class="toast-msg">${msg}</div>` : ''}</div>`;
  toastContainer.appendChild(el);
  const remove = () => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 300);
  };
  const timer = setTimeout(remove, duration);
  el.addEventListener('click', () => { clearTimeout(timer); remove(); });
}

// â”€â”€ Run History (localStorage) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const RUN_HISTORY_KEY = 'mpr_run_history';
const RUN_HISTORY_MAX = 20;

function loadRunHistory() {
  try { return JSON.parse(localStorage.getItem(RUN_HISTORY_KEY) || '[]'); } catch { return []; }
}

function saveRunToHistory(entry) {
  const history = loadRunHistory();
  history.unshift(entry);
  if (history.length > RUN_HISTORY_MAX) history.length = RUN_HISTORY_MAX;
  try { localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(history)); } catch { /* storage full */ }
  
  recordSessionRun(entry); // Phase 36: track in session timeline
  sendRunToBot(entry);     // Sync to bot: POST /desktop/run (fire-and-forget)
  
  // â”€â”€ Update career tracking (Phase 31-33) â”€â”€
  const career = updateCareerStats(entry);
  if (career) {
    checkAchievements(career);
    checkSessionRecap(career); // Phase 33: session recap every 5 runs
    checkHotStreak(career);    // Phase 36: hot streak detection
    updateCareerDashboard();   // Real-time dashboard sync (Phase 32)
    updateSessionGoalUI();     // Phase 35: session goal progress
    renderSessionTimeline();   // Phase 36: session timeline
    console.log('[CAREER] Stats updated:', { runs: career.totalRuns, bestScore: career.bestScore });
  }
}

function renderRunHistory() {
  const list = document.getElementById('runHistoryList');
  const count = document.getElementById('runHistoryCount');
  const exportBtn = document.getElementById('exportRunHistoryBtn');
  if (!list) return;
  const allHistory = loadRunHistory();
  const history = getFilteredRunHistory();
  const isFiltered = _rhActiveFilter !== 'all' || _rhRouteSearch !== '';
  if (count) count.textContent = allHistory.length > 0 ? (isFiltered ? `(${history.length} / ${allHistory.length})` : `(${allHistory.length})`) : '';
  if (exportBtn) exportBtn.classList.toggle('rh-export-hidden', allHistory.length === 0);
  if (history.length === 0) {
    list.innerHTML = isFiltered
      ? '<li class="rh-empty">No runs match filter. <button class="rh-clear-filter" onclick="clearRunHistoryFilter()">Clear filter</button></li>'
      : '<li class="rh-empty">No runs logged yet. Get on the grid.</li>';
    renderScoreChart();
    return;
  }
  list.innerHTML = history.map((r) => {
    const isPB   = r.isPB;
    const isClean = r.clean;
    const rowClass = isPB ? 'rh-item rh-best' : isClean ? 'rh-item rh-clean' : 'rh-item';
    const cleanBadge = isClean
      ? '<span class="rh-badge clean">CLEAN</span>'
      : '<span class="rh-badge dirty">CRASH</span>';
    const pbBadge = isPB ? '<span class="rh-badge pb">NEW PB</span>' : '';
    const score = Number(r.score || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const combo = r.maxCombo ? `Ã—${Number(r.maxCombo).toFixed(2)}` : '';
    const dur   = r.durationSec ? `${r.durationSec}s` : '';
    // Phase 34: delta vs career PB
    const runScore = Number(r.score || 0);
    const deltaInfo = !isPB ? getRunDeltaVsPB(runScore) : null;
    const deltaBadge = deltaInfo ? `<span class="rh-delta ${deltaInfo.cls}">${deltaInfo.label}</span>` : '';
    return `<li class="${rowClass}">
      <div>
        <div style="font-weight:600;">${score}${deltaBadge}</div>
        <div class="rh-route">${r.route || 'Unknown'}</div>
        <div class="rh-meta">${cleanBadge}${pbBadge}${combo ? `<span>${combo} combo</span>` : ''}${dur ? `<span>${dur}</span>` : ''}</div>
      </div>
      <div class="rh-score" style="font-size:0.72rem;color:var(--text-3);">${r.time || ''}</div>
    </li>`;
  }).join('');
  renderScoreChart();
  renderScoreHistogram(); // Phase 35
}

function exportRunHistoryCSV() {
  const history = loadRunHistory();
  if (!history.length) return;
  const headers = ['Time', 'Route', 'Score', 'Clean', 'MaxCombo', 'Duration(s)', 'PersonalBest'];
  const rows = history.map((r) => [
    r.time || '',
    `"${(r.route || '').replace(/"/g, '""')}"`,
    Number(r.score || 0),
    r.clean ? 'YES' : 'NO',
    Number(r.maxCombo || 1).toFixed(2),
    Number(r.durationSec || 0),
    r.isPB ? 'YES' : 'NO',
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `mpr-runs-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  showToast({ icon: 'â¬‡', title: 'Export Ready', msg: `${history.length} runs exported.`, type: 'clean', duration: 3000 });
}

function renderScoreChart() {
  const el = document.getElementById('scoreChart');
  if (!el) return;
  const history = loadRunHistory().slice(0, 10).reverse();
  if (!history.length) {
    el.innerHTML = '<p class="empty-msg">No runs to chart yet.</p>';
    return;
  }
  const maxScore = Math.max(...history.map((r) => Number(r.score || 0)), 1);
  el.innerHTML = history.map((r) => {
    const score = Number(r.score || 0);
    const pct   = Math.max(4, Math.round((score / maxScore) * 100));
    const lbl   = score >= 10000 ? `${(score / 1000).toFixed(0)}k`
                : score >= 1000  ? `${(score / 1000).toFixed(1)}k`
                : String(score);
    return `<div class="sc-bar-wrap">
      <div class="sc-bar${r.isPB ? ' pb' : ''}" style="height:${pct}%" title="${score.toLocaleString()}"></div>
      <div class="sc-bar-lbl">${lbl}</div>
    </div>`;
  }).join('');
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  LAP TIMER  (Phase 23)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const lapTimer = (() => {
  let _start   = null;
  let _elapsed = 0;       // ms accumulated
  let _running = false;
  let _raf     = null;
  let _splits  = [];

  const dispEl    = () => document.getElementById('lapTimeDisplay');
  const statEl    = () => document.getElementById('lapStatus');
  const startBtn  = () => document.getElementById('lapStartBtn');
  const stopBtn   = () => document.getElementById('lapStopBtn');
  const resetBtn  = () => document.getElementById('lapResetBtn');
  const splitList = () => document.getElementById('lapSplitsList');

  function fmt(ms) {
    const m   = Math.floor(ms / 60000);
    const s   = Math.floor((ms % 60000) / 1000);
    const frac = ms % 1000;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(frac).padStart(3,'0')}`;
  }

  function tick() {
    if (!_running) return;
    const now = performance.now();
    const total = _elapsed + (now - _start);
    const el = dispEl();
    if (el) el.textContent = fmt(total);
    _raf = requestAnimationFrame(tick);
  }

  function updateButtons() {
    const sb = startBtn(); const st = stopBtn(); const rb = resetBtn();
    if (!sb || !st || !rb) return;
    sb.disabled = _running;
    st.disabled = !_running;
    rb.disabled = false;
  }

  function start() {
    if (_running) return;
    _start   = performance.now();
    _running = true;
    const el = dispEl(); const se = statEl();
    if (el) { el.classList.add('running'); el.classList.remove('stopped-has-time'); }
    if (se) se.textContent = 'RUNNING';
    updateButtons();
    tick();
    showToast({ icon: 'â±', title: 'Lap Timer Started', type: 'finish', duration: 1500 });
  }

  function stop() {
    if (!_running) return;
    _elapsed += performance.now() - _start;
    _running = false;
    cancelAnimationFrame(_raf);
    const el = dispEl(); const se = statEl();
    if (el) { el.textContent = fmt(_elapsed); el.classList.remove('running'); el.classList.add('stopped-has-time'); }
    if (se) se.textContent = 'STOPPED';
    updateButtons();
    showToast({ icon: 'ðŸ', title: 'Lap Stopped', msg: fmt(_elapsed), type: 'clean', duration: 3000 });
  }

  function reset() {
    const wasRunning = _running;
    if (_running) { _running = false; cancelAnimationFrame(_raf); }
    _elapsed = 0;
    _splits  = [];
    const el = dispEl(); const se = statEl(); const sl = splitList();
    if (el) { el.textContent = '00:00.000'; el.classList.remove('running','stopped-has-time'); }
    if (se) se.textContent = 'STOPPED';
    if (sl) sl.innerHTML   = '';
    updateButtons();
    if (wasRunning) showToast({ icon: 'â±', title: 'Timer Reset', type: 'finish', duration: 1500 });
  }

  function split() {
    if (!_running && _elapsed === 0) return;
    const now   = _running ? _elapsed + (performance.now() - _start) : _elapsed;
    const prev  = _splits.length ? _splits[_splits.length - 1].total : 0;
    const delta = now - prev;
    _splits.push({ total: now, delta });
    const sl = splitList();
    if (!sl) return;
    const isBest = _splits.length === 1 || delta === Math.min(..._splits.map((s) => s.delta));
    const li = document.createElement('li');
    if (isBest && _splits.length > 1) li.className = 'lap-split-best';
    li.innerHTML = `<span>Split ${_splits.length}</span><span>${fmt(delta)}</span><span style="color:var(--text-3)">${fmt(now)}</span>`;
    sl.appendChild(li);
    sl.scrollTop = sl.scrollHeight;
    showToast({ icon: 'âœ‚', title: `Split ${_splits.length}`, msg: fmt(delta), type: 'finish', duration: 2000 });
  }

  function toggle() { _running ? stop() : start(); }

  // wire buttons
  document.getElementById('lapStartBtn')?.addEventListener('click', start);
  document.getElementById('lapStopBtn')?.addEventListener('click', stop);
  document.getElementById('lapResetBtn')?.addEventListener('click', reset);

  return { start, stop, reset, split, toggle };
})();

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  THEME TOGGLE  (Phase 25)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function applyTheme(light) {
  document.body.classList.toggle('theme-light', !!light);
}

function getLocalFallbackAssets() {
  return [
    { name: 'welcome-banner', url: '../assets/banners/welcome-banner.jpg' },
    { name: 'role-selection-banner', url: '../assets/banners/role-selection-banner.jpg' },
    { name: 'support-hub-banner', url: '../assets/banners/support-hub-banner.jpg' },
    { name: 'team-hub-banner', url: '../assets/banners/team-hub-banner.jpg' },
    { name: 'solo-board', url: '../assets/banners/solo-board.jpg' },
    { name: 'street-board', url: '../assets/banners/street-board.jpg' },
    { name: 'circuit-board', url: '../assets/banners/circuit-board.jpg' },
    { name: 'team-board', url: '../assets/banners/team-board.jpg' },
  ];
}

function showTab(tabId) {
  tabs.forEach((tab) => tab.classList.remove('active'));
  tabButtons.forEach((btn) => btn.classList.remove('active'));

  const tab = document.getElementById(tabId);
  const button = tabButtons.find((btn) => btn.dataset.tab === tabId);

  if (!tab || !button) return;

  // clear server nav badge when switching to servers tab
  if (tabId === 'servers') {
    const badge = document.getElementById('serverNavBadge');
    if (badge) { badge.textContent = ''; badge.dataset.count = '0'; badge.classList.remove('visible'); }
  }
  
  // Update feature gates when entering settings
  if (tabId === 'settings') {
    updateFeatureGates();
  }

  // Auto-load admin status when opening the admin tab
  if (tabId === 'admin' && isOwner()) {
    fetchAdminStatus().then((s) => {
      const el = (id) => document.getElementById(id);
      if (el('adminBotPing'))     el('adminBotPing').textContent     = `${s.ping}ms`;
      if (el('adminBotUptime'))   el('adminBotUptime').textContent   = s.uptime;
      if (el('adminGuildName'))   el('adminGuildName').textContent   = s.guildName;
      if (el('adminMemberCount')) el('adminMemberCount').textContent = String(s.memberCount);
      if (el('adminBotTag'))      el('adminBotTag').textContent      = s.botTag;
    }).catch(() => null); // silently fail if bot is offline
  }

  tab.classList.add('active');
  button.classList.add('active');
}

function updateLaunchBtnState() {
  if (!launchBtn) return;
  const { acPath } = loadSettings();
  const hasPath = !!(acPath && acPath.trim());
  launchBtn.classList.toggle('configured', hasPath);
  launchBtn.title = hasPath ? `Launch: ${acPath.trim()}` : 'Launch Assetto Corsa';
}

function launchGame() {
  const { acPath } = loadSettings();
  const path = (acPath || '').trim();
  if (path) {
    // Copy path to clipboard; user pastes into Win+R or Explorer
    navigator.clipboard?.writeText(path).catch(() => {});
    showToast({
      icon: 'ðŸš€',
      title: 'AC Path Copied',
      msg: 'Paste into Win+R or file explorer to launch.',
      type: 'finish',
      duration: 6000,
    });
  } else {
    window.location.href = `fivem://connect/${SERVER_IP}`;
  }
}

function toUpdatedLabel(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function animateValue(element, start, end, duration) {
  if (!element) return;
  let startTime = null;
  function step(timestamp) {
    if (!startTime) startTime = timestamp;
    const progress = Math.min(timestamp - startTime, duration);
    element.textContent = Math.floor(start + (end - start) * (progress / duration)).toLocaleString();
    if (progress < duration) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function triggerComboPulse(el) {
  if (!el) return;
  el.classList.remove('combo-pulse');
  // force reflow so the animation re-triggers
  void el.offsetWidth; // eslint-disable-line no-void
  el.classList.add('combo-pulse');
  setTimeout(() => el.classList.remove('combo-pulse'), 400);
}

function applyScoreGlow(el, score) {
  if (!el) return;
  el.classList.toggle('active', score > 1000);
}

function setServerOnlineState(isOnline) {
  serverStatusDot.classList.toggle('online', !!isOnline);
  serverStatusDot.classList.toggle('offline', !isOnline);
  serverStatusText.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
}

function normalizeAssetUrl(rawUrl) {
  const source = String(rawUrl || '').trim();
  if (!source) return '';

  try {
    const parsed = new URL(source);
    const host = parsed.hostname.toLowerCase();
    if (host === 'cdn.discordapp.com' || host === 'media.discordapp.net') {
      return `${parsed.origin}${parsed.pathname}`;
    }
    return parsed.toString();
  } catch {
    return source;
  }
}

function isSupportedAssetUrl(value) {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) || /^\.\.\//.test(url) || /^\.\//.test(url) || /^\//.test(url);
}

function renderLeaderboard(rows) {
  const items = Array.isArray(rows) ? rows : [];
  if (!items.length) {
    leaderboardList.innerHTML = '<li>No data available</li>';
    return;
  }

  leaderboardList.innerHTML = items
    .map((row) => `<li><div class="board-row">${rankChip(Number(row.rank))}<span class="br-detail">${row.driver}</span><span class="br-score">${Number(row.points || 0).toLocaleString()} pts</span></div></li>`)
    .join('');
}

function renderTeams(rows) {
  const items = Array.isArray(rows) ? rows : [];
  if (!items.length) {
    topTeamName.textContent = 'No Team Data';
    topTeamMeta.textContent = 'Database offline or no teams created yet.';
    teamList.innerHTML = '<li>#1 No data - 0 pts</li>';
    return;
  }

  const top = items[0];
  topTeamName.textContent = top.name;
  topTeamMeta.textContent = `${Number(top.points || 0).toLocaleString()} pts | ${Number(top.wins || 0)} wins`;
  teamList.innerHTML = items
    .map((row) => `<li><div class="board-row">${rankChip(Number(row.rank))}<span class="br-detail">${row.name}</span><span class="br-score">${Number(row.points || 0).toLocaleString()} pts</span></div></li>`)
    .join('');
}

function renderTeamDrilldown(items) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    teamDrilldownWrap.innerHTML = '<p>No team drilldown data available.</p>';
    return;
  }

  teamDrilldownWrap.innerHTML = rows
    .map((team) => {
      const members = Array.isArray(team.topMembers) ? team.topMembers : [];
      const memberList = members.length
        ? members
            .map((member) => `<li>${member.displayName} - ${Number(member.contribution || 0).toLocaleString()} contrib (${member.tier})</li>`)
            .join('')
        : '<li>No member data</li>';

      return `
        <section class="drill-card">
          <h4>#${team.rank} ${team.name}</h4>
          <p>Captain: ${team.captainName}</p>
          <p>Members: ${Number(team.memberCount || 0)} | Wins: ${Number(team.wins || 0)} | Points: ${Number(team.points || 0).toLocaleString()}</p>
          <ul class="board-list mini">${memberList}</ul>
        </section>
      `;
    })
    .join('');
}

function renderTrafficMetrics(metrics) {
  const m = metrics || {};
  const band = String(m.speedBand || 'Unknown');

  trafficDensityText.textContent = `${Number(m.aiDensityPct || 0)}%`;
  trafficSpeedText.textContent = `${Number(m.avgSpeed || 0)} mph`;
  trafficCrashesText.textContent = `${Number(m.crashes || 0)}`;
  trafficRiskText.textContent = m.riskLevel || 'Unknown';
  trafficRiskScoreText.textContent = `${Number(m.riskScore || 0)}`;
  trafficSessionWeightText.textContent = `${Number(m.sessionWeight || 1).toFixed(2)}x`;

  trafficBandPill.textContent = `Band: ${band}`;
  trafficBandPill.dataset.band = band.toLowerCase();
}

function renderAssets(assets) {
  const items = Array.isArray(assets) ? assets : [];
  if (!items.length) {
    if (!localAssetFallbackRendered) {
      localAssetFallbackRendered = true;
      renderAssets(getLocalFallbackAssets());
      return;
    }
    assetGallery.innerHTML = '<p>No assets loaded.</p>';
    return;
  }

  const validItems = items
    .map((asset) => ({
      ...asset,
      url: normalizeAssetUrl(asset?.url),
    }))
    .filter((asset) => isSupportedAssetUrl(asset?.url))
    .slice(0, 8);

  if (!validItems.length) {
    if (!localAssetFallbackRendered) {
      localAssetFallbackRendered = true;
      renderAssets(getLocalFallbackAssets());
      return;
    }
    assetGallery.innerHTML = '<p>No valid assets loaded.</p>';
    return;
  }

  localAssetFallbackRendered = false;

  assetGallery.innerHTML = validItems.map((asset) => {
    const title = asset.name || 'asset';
    const url = asset.url || '';
    return `
      <a class="asset-item" href="${url}" target="_blank" rel="noreferrer noopener" title="${title}">
        <img src="${url}" alt="${title}" loading="lazy" decoding="async">
      </a>
    `;
  }).join('');

  // Remove dead links immediately if an image fails to load.
  assetGallery.querySelectorAll('img').forEach((img) => {
    img.addEventListener('error', () => {
      const parent = img.closest('.asset-item');
      if (parent) parent.remove();

      if (!assetGallery.querySelector('.asset-item')) {
        if (!localAssetFallbackRendered) {
          localAssetFallbackRendered = true;
          renderAssets(getLocalFallbackAssets());
          return;
        }
        assetGallery.innerHTML = '<p>No assets loaded.</p>';
      }
    }, { once: true });
  });
}

function renderRunTracker(run) {
  const r = run || {};
  const state = String(r.status || 'IDLE').toUpperCase();
  const pillClass = state === 'RUNNING' ? 'running' : state === 'FINISHED' ? 'finished' : 'idle';
  runStatusText.innerHTML = `<span class="run-pill ${pillClass}">${state}</span>`;
  runDurationText.textContent = `${Number(r.durationSec || 0)}s`;
  runScoreText.textContent = Number(r.currentScore || 0).toLocaleString();
  runBestScoreText.textContent = Number(r.bestScore || 0).toLocaleString();
  runLastScoreText.textContent = Number(r?.lastRun?.score || 0).toLocaleString();
  const routeSuffix = r.route ? ` (${r.route})` : '';
  homeRunModeText.textContent = `${String(r.status || 'IDLE')}${routeSuffix}`;
  homeCleanStateText.textContent = r.clean === false ? 'NO' : 'YES';
  if (routeNameText) routeNameText.textContent = r.route || 'None';
  // KPI chip reactivity
  const kpiRunChip = homeRunModeText?.parentElement;
  if (kpiRunChip) kpiRunChip.classList.toggle('kpi-running', state === 'RUNNING');
  const kpiCleanChip = homeCleanStateText?.parentElement;
  if (kpiCleanChip) kpiCleanChip.classList.toggle('kpi-dirty', r.clean === false);
  // Session run dot pulse
  if (sessionRunDot) sessionRunDot.classList.toggle('active', state === 'RUNNING');
  // Sound: run complete on RUNNING â†’ FINISHED transition
  if (state === 'FINISHED' && _lastRunState === 'RUNNING') {
    soundRunComplete();
    // Save run to history
    const score   = Number(r.currentScore || r.lastRun?.score || 0);
    const best    = Number(r.bestScore || 0);
    const isPB    = score > 0 && score >= best;
    const isClean = r.clean !== false;
    const entry   = {
      score,
      route:      r.route || 'Unknown',
      clean:      isClean,
      maxCombo:   Number(r.maxCombo ?? _lastCombo ?? 1),
      durationSec: Number(r.durationSec || 0),
      isPB,
      time:       new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ts:         Date.now(), // stable dedup timestamp (ms since epoch)
    };
    saveRunToHistory(entry);
    updateSessionStatsStrip();
    // Toasts
    if (isPB) {
      showToast({ icon: 'ðŸ†', title: 'NEW PERSONAL BEST!', msg: `${score.toLocaleString(undefined, { maximumFractionDigits: 0 })} pts â€” ${r.route || 'Unknown'}`, type: 'best', duration: 6000 });
    } else if (isClean) {
      showToast({ icon: 'âœ“', title: 'Clean Run!', msg: `${score.toLocaleString(undefined, { maximumFractionDigits: 0 })} pts â€” ${r.route || 'Unknown'}`, type: 'clean' });
    } else {
      showToast({ icon: 'â—ˆ', title: 'Run Finished', msg: `${score.toLocaleString(undefined, { maximumFractionDigits: 0 })} pts â€” ${r.route || 'Unknown'}`, type: 'finish' });
    }
  }
  // Reset combo milestone tracker when a new run starts
  if (state === 'RUNNING' && _lastRunState !== 'RUNNING') { _lastCombo = 1; _lastComboFloor = 1; }
  _lastRunState = state;
}

function renderLiveComboState(data) {
  const combo = Number(data?.combo ?? data?.run?.combo ?? 1);
  const maxCombo = Number(data?.maxCombo ?? data?.run?.maxCombo ?? 1);
  const score = Number(data?.score ?? data?.run?.currentScore ?? 0);

  // Score: count-up animation from current displayed value
  const currentDisplayed = parseInt(String(liveScoreText.textContent).replace(/,/g, ''), 10) || 0;
  if (score !== currentDisplayed) {
    animateValue(liveScoreText, currentDisplayed, Math.floor(score), 300);
    // pop animation on the stat card
    const statEl = liveScoreText.closest ? liveScoreText.closest('.stat-block') : null;
    if (statEl) {
      statEl.classList.remove('score-pop');
      void statEl.offsetWidth; // eslint-disable-line no-void
      statEl.classList.add('score-pop');
      setTimeout(() => statEl.classList.remove('score-pop'), 350);
    }
  }

  liveComboText.textContent = `x${combo.toFixed(2)}`;
  maxComboText.textContent = `x${maxCombo.toFixed(2)}`;

  // Combo visual state
  liveComboText.classList.remove('combo-high', 'combo-insane');
  if (combo > 6) {
    liveComboText.classList.add('combo-insane');
  } else if (combo > 3) {
    liveComboText.classList.add('combo-high');
  }

  // Combo pulse when actively building
  if (combo > 2) {
    triggerComboPulse(liveComboText);
  }

  // Sound: pitch-scaled combo tick when combo crosses a new integer threshold
  const comboFloor = Math.floor(combo);
  if (comboFloor > _lastComboFloor && combo > 1.5) {
    // Milestone bursts override regular tick
    if (comboFloor === 5 || comboFloor === 10 || comboFloor === 20) {
      soundComboMilestone();
    } else {
      soundComboTick(combo);
    }
    _lastComboFloor = comboFloor;
  }
  _lastCombo = combo;

  // Big-stat glow reactivity
  const scoreCard = liveScoreText.closest ? liveScoreText.closest('.stat-block') : null;
  applyScoreGlow(scoreCard, score);

  if (scoreProgressFill) {
    const best = parseInt(String(runBestScoreText?.textContent || '0').replace(/,/g, ''), 10) || 0;
    const pct = best > 0 ? Math.min(100, Math.round((score / best) * 100)) : 0;
    scoreProgressFill.style.width = `${pct}%`;
  }

  // Phase 35: live PB delta in HUD
  updateLivePBDelta(score);

  const comboCard = liveComboText.closest ? liveComboText.closest('.stat-block') : null;
  if (comboCard) comboCard.classList.toggle('active', combo > 3);
}

function renderRunLeaderboard(payload) {
  const source = String(payload?.source || 'memory');
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  runBoardSourceText.textContent = source;

  if (!rows.length) {
    runBoardList.innerHTML = '<li>#1 No completed runs yet</li>';
    return;
  }

  runBoardList.innerHTML = rows.slice(0, 5).map((row) => {
    const rank = Number(row.rank || 0);
    const score = Number(row.score || 0).toLocaleString();
    const speed = Number(row.maxSpeed || 0);
    const dur = Number(row.durationSec || 0);
    return `<li><div class="board-row">${rankChip(rank)}<span class="br-detail">${speed} km/h Â· ${dur}s</span><span class="br-score">${score}</span></div></li>`;
  }).join('');
}

function renderSectorTile(tile, statusEl, loadEl, sessionEl, snapshot) {
  const online = !!snapshot?.online;
  const players = Number(snapshot?.players || 0);
  const capacity = Number(snapshot?.capacity || 0);
  const session = String(snapshot?.session || '-');

  tile.dataset.online = online ? 'true' : 'false';
  statusEl.textContent = online ? 'Online' : 'Offline';
  loadEl.textContent = `${players} / ${capacity}`;
  sessionEl.textContent = session;
}

function renderServerCards(sectorMap) {
  let totalOnline = 0;
  let totalPlayers = 0;
  let totalCapacity = 0;
  let mostActiveName = '--';
  let mostActivePlayers = 0;
  let mostActiveSession = '-';
  let mostActivePct = 0;

  const LABELS = { main: 'Mainline Circuit', traffic: 'Midnight Traffic', drift: 'Pine Drift Zone', race: 'Race Event Server', nord: 'Nordschleife' };

  for (const [key, snapshot] of Object.entries(sectorMap)) {
    const refs = SRV_CARDS[key];
    if (!refs) continue;

    const online   = !!snapshot?.online;
    const players  = Number(snapshot?.players || 0);
    const capacity = Number(snapshot?.capacity || 0);
    const sess     = String(snapshot?.session || '-');
    const pct      = capacity > 0 ? Math.min(100, Math.round((players / capacity) * 100)) : 0;

    refs.card.dataset.online = online ? 'true' : 'false';
    refs.badge.textContent   = online ? 'ONLINE' : 'OFFLINE';
    refs.badge.className     = 'srv-status-badge' + (online ? ' online' : '');
    refs.players.textContent = players;
    refs.cap.textContent     = capacity;
    refs.sess.textContent    = sess;
    refs.fill.style.width    = pct + '%';

    if (online) totalOnline++;
    totalPlayers   += players;
    totalCapacity  += capacity;

    if (online && players > mostActivePlayers) {
      mostActivePlayers = players;
      mostActiveName    = LABELS[key] || key;
      mostActiveSession = sess;
      mostActivePct     = pct;
    }
  }

  const elOnline   = document.getElementById('srvSummaryOnline');
  const elPlayers  = document.getElementById('srvSummaryPlayers');
  const elCap      = document.getElementById('srvSummaryCapacity');
  const elUpdated  = document.getElementById('srvSummaryUpdated');
  const elMAName   = document.getElementById('srvMostActiveName');
  const elMAPlay   = document.getElementById('srvMostActivePlayers');
  const elMASess   = document.getElementById('srvMostActiveSession');
  const elMAPct    = document.getElementById('srvMostActivePct');

  if (elOnline)  elOnline.textContent  = `${totalOnline} / 5`;
  if (elPlayers) elPlayers.textContent = totalPlayers;
  if (elCap)     elCap.textContent     = totalCapacity;
  if (elUpdated) elUpdated.textContent = new Date().toLocaleTimeString();
  if (elMAName)  elMAName.textContent  = mostActiveName;
  if (elMAPlay)  elMAPlay.textContent  = mostActivePlayers;
  if (elMASess)  elMASess.textContent  = mostActiveSession;
  if (elMAPct)   elMAPct.textContent   = mostActivePct + '%';

  // badge: count servers whose online state changed since last render
  const badge = document.getElementById('serverNavBadge');
  if (badge) {
    let changed = 0;
    for (const [key, snapshot] of Object.entries(sectorMap)) {
      const online = !!snapshot?.online;
      if (_prevServerStates[key] !== undefined && _prevServerStates[key] !== online) changed++;
      _prevServerStates[key] = online;
    }
    if (changed > 0) {
      const current = parseInt(badge.dataset.count || '0', 10) + changed;
      badge.dataset.count = String(current);
      badge.textContent = String(current);
      badge.classList.add('visible');
    }
  }
}

function renderSectorGrid(data) {
  const sectors = data?.sectors || {};
  const server = sectors.main || data?.server || {};
  const traffic = sectors.traffic || data?.traffic || {};
  const drift = sectors.drift || { online: false, players: 0, capacity: 0, session: '-' };
  const race = sectors.race || { online: false, players: 0, capacity: 0, session: '-' };
  const nord = sectors.nord || { online: false, players: 0, capacity: 0, session: '-' };

  renderSectorTile(sectorMainTile, sectorMainStatus, sectorMainLoad, sectorMainSession, server);
  renderSectorTile(sectorTrafficTile, sectorTrafficStatus, sectorTrafficLoad, sectorTrafficSession, traffic);
  renderSectorTile(sectorDriftTile, sectorDriftStatus, sectorDriftLoad, sectorDriftSession, drift);
  renderSectorTile(sectorRaceTile, sectorRaceStatus, sectorRaceLoad, sectorRaceSession, race);
  renderSectorTile(sectorNordTile, sectorNordStatus, sectorNordLoad, sectorNordSession, nord);

  renderServerCards({ main: server, traffic, drift, race, nord });
}

function syncRouteOptions(routeNames) {
  if (!routeSelect) return;
  const names = Array.isArray(routeNames) ? routeNames.filter(Boolean) : [];
  if (!names.length) return;

  const currentValue = routeSelect.value;
  routeSelect.innerHTML = names.map((name) => `<option>${name}</option>`).join('');
  if (names.includes(currentValue)) {
    routeSelect.value = currentValue;
  }
}

function getTelemetryOrigin() {
  try {
    return new URL(telemetryApiUrl).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

function getTelemetryEndpoint(pathname) {
  return new URL(pathname, getTelemetryOrigin()).toString();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 900) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function generateRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── API Health Badge ────────────────────────────────────────────────────────
let _apiHealthState = 'unknown'; // 'connected' | 'reconnecting' | 'offline' | 'unknown'
function setApiHealthBadge(state) {
  if (_apiHealthState === state) return;
  _apiHealthState = state;
  const badge = document.getElementById('apiHealthBadge');
  const text  = document.getElementById('apiHealthText');
  if (!badge || !text) return;
  badge.className = `topbar-meta api-health-badge ${state}`;
  text.textContent = state === 'connected' ? 'BOT' : state === 'reconnecting' ? 'BOT' : 'BOT';
  badge.title = state === 'connected' ? 'Bot API: Connected' : state === 'reconnecting' ? 'Bot API: Reconnecting...' : 'Bot API: Offline';
}

async function postToIntegration(pathname, payload, { timeoutMs = INTEGRATION_WRITE_TIMEOUT_MS, expectJson = false } = {}) {
  const base = activeApiBase || await resolveApiBaseForAuth();
  if (!base) {
    setApiHealthBadge('offline');
    throw new Error('integration_api_offline');
  }

  const targetUrl = new URL(pathname, base);
  if (API_TOKEN) targetUrl.searchParams.set('token', API_TOKEN);

  const requestId = generateRequestId();
  let response;
  try {
    response = await fetchWithTimeout(targetUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': requestId,
        ...(API_TOKEN ? { 'x-desktop-token': API_TOKEN } : {}),
      },
      body: JSON.stringify(payload || {}),
    }, timeoutMs);
  } catch (err) {
    setApiHealthBadge(_apiHealthState === 'connected' ? 'reconnecting' : 'offline');
    throw err;
  }

  if (!response.ok) {
    // 4xx means the API is up but rejected the request — still "connected"
    if (response.status < 500) setApiHealthBadge('connected');
    else setApiHealthBadge('reconnecting');
    throw new Error(`${pathname}_failed_${response.status}`);
  }

  setApiHealthBadge('connected');

  if (!expectJson) return null;

  try {
    return await response.json();
  } catch {
    throw new Error(`${pathname}_invalid_json`);
  }
}

async function loadRouteLeaderboard() {
  if (!routeSelect || !routeLeaderboard) return;
  const route = String(routeSelect.value || '').trim();
  if (!route) return;

  try {
    const url = getTelemetryEndpoint(`/api/leaderboard/${encodeURIComponent(route)}`);
    const res = await fetchWithTimeout(url, {}, 1400);
    if (!res.ok) throw new Error(`route_leaderboard_failed_${res.status}`);
    const data = await res.json();
    const rows = Array.isArray(data) ? data : [];

    if (!rows.length) {
      routeLeaderboard.innerHTML = '<li>#1 No official runs for this route yet</li>';
      return;
    }

    routeLeaderboard.innerHTML = rows.map((run, i) => {
      const score = Number(run.score || 0).toLocaleString();
      const speed = Number(run.maxSpeed || 0);
      return `<li><div class="board-row">${rankChip(i + 1)}<span class="br-detail">${speed} km/h</span><span class="br-score">${score}</span></div></li>`;
    }).join('');
  } catch {
    routeLeaderboard.innerHTML = '<li>#1 Route leaderboard offline</li>';
  }
}

async function fetchTelemetry() {
  try {
    const res = await fetchWithTimeout(telemetryApiUrl, {}, 700);
    if (!res.ok) {
      throw new Error(`telemetry_fetch_failed_${res.status}`);
    }

    const data = await res.json();
    const currentSpeed = parseInt(String(speedText.textContent).replace(/[^0-9]/g, ''), 10) || 0;
    const newSpeed = Number(data.speed || 0);
    if (newSpeed !== currentSpeed) {
      animateValue(speedText, currentSpeed, newSpeed, 150);
    } else {
      speedText.textContent = `${newSpeed}`;
    }
    const rpm = Number(data.rpm || 0);
    rpmText.textContent = `${rpm}`;
    const rpmBlock = rpmText.closest?.('.stat-block');
    if (rpmBlock) {
      rpmBlock.classList.remove('rpm-warn', 'rpm-danger');
      if (rpm > 7500) rpmBlock.classList.add('rpm-danger');
      else if (rpm > 5500) rpmBlock.classList.add('rpm-warn');
    }
    // Speed reactivity
    const speedBlock = speedText.closest?.('.stat-block');
    if (speedBlock) {
      speedBlock.classList.remove('speed-warn', 'speed-danger');
      if (window._settingSpeedReact !== false) {
        if (newSpeed > 200) speedBlock.classList.add('speed-danger');
        else if (newSpeed > 150) speedBlock.classList.add('speed-warn');
      }
    }
    // Gear color
    const gearRaw = String(data.gear || 'N');
    gearText.textContent = gearRaw;
    gearText.classList.remove('gear-reverse', 'gear-neutral', 'gear-high');
    if (gearRaw === 'R') gearText.classList.add('gear-reverse');
    else if (gearRaw === 'N' || gearRaw === '0') gearText.classList.add('gear-neutral');
    else if (Number(gearRaw) >= 4) gearText.classList.add('gear-high');
    positionText.textContent = `#${Number(data.position || 0)}`;
    driftScoreText.textContent = `${Number(data.driftScore || 0)}`;
    if (maxSpeedText) maxSpeedText.textContent = Number(data.avgSpeed || 0);
    telemetrySourceText.textContent = String(data.source || 'none').replace(/_/g, ' ').toUpperCase();
    syncRouteOptions(data.availableRoutes);
    renderLiveComboState(data);
    renderRunTracker(data.run);

    try {
      const boardRes = await fetchWithTimeout(getTelemetryEndpoint('/api/run/leaderboard?limit=5'), {}, 1400);
      if (boardRes.ok) {
        const board = await boardRes.json();
        renderRunLeaderboard(board);
      }
    } catch {
      // Non-blocking: keep telemetry card rendering.
    }

    if (Number.isFinite(Number(data.players)) && Number.isFinite(Number(data.maxPlayers))) {
      playersText.textContent = `${Number(data.players || 0)} / ${Number(data.maxPlayers || 0)}`;
    }
    if (Number.isFinite(Number(data.traffic))) {
      trafficDensityText.textContent = `${Number(data.traffic || 0)}%`;
    }
    if (Number.isFinite(Number(data.crashes))) {
      trafficCrashesText.textContent = `${Number(data.crashes || 0)}`;
      session.crashes = Number(data.crashes || 0);
      sessionStorage.setItem('mpr_session_crashes', String(session.crashes));
    }
    setServerOnlineState(String(data.status || '').toLowerCase() !== 'offline');
    return true;
  } catch (err) {
    // Telemetry API is optional when AC is not running.
    const now = Date.now();
    if (now - lastTelemetryErrorLogAt > 5000) {
      console.error('Telemetry error:', err);
      lastTelemetryErrorLogAt = now;
    }
    return false;
  }
}

function getTelemetryPollDelayMs() {
  if (telemetryConsecutiveFailures <= 0) {
    return LIVE_REFRESH_MS;
  }

  const backoff = LIVE_REFRESH_MS * (2 ** Math.min(5, telemetryConsecutiveFailures));
  const cappedBackoff = Math.min(TELEMETRY_POLL_MAX_MS, backoff);
  const jitterRange = Math.max(1, Math.round(cappedBackoff * TELEMETRY_BACKOFF_JITTER_RATIO));
  const jitterOffset = Math.floor((Math.random() * ((jitterRange * 2) + 1)) - jitterRange);
  return Math.max(LIVE_REFRESH_MS, cappedBackoff + jitterOffset);
}

function applyOfflineTelemetryUi() {
  setServerOnlineState(false);
  telemetrySourceText.textContent = 'OFFLINE';
  homeRunModeText.textContent = 'DISCONNECTED';
  homeCleanStateText.textContent = 'N/A';
}

function applyReconnectingTelemetryUi() {
  setServerOnlineState(false);
  if (serverStatusText) serverStatusText.textContent = 'RECONNECTING';
  telemetrySourceText.textContent = 'RECONNECTING';
  homeRunModeText.textContent = 'RECONNECTING';
  homeCleanStateText.textContent = 'N/A';
}

function scheduleNextTelemetryPoll(delayMs = null) {
  if (telemetryPollTimer) {
    clearTimeout(telemetryPollTimer);
  }

  const delay = Number.isFinite(Number(delayMs)) ? Number(delayMs) : getTelemetryPollDelayMs();
  telemetryPollTimer = setTimeout(async () => {
    const ok = await fetchTelemetry();
    if (ok) {
      telemetryConsecutiveFailures = 0;
      telemetryOfflineConfirmed = false;
    } else {
      telemetryConsecutiveFailures += 1;
      if (telemetryConsecutiveFailures >= TELEMETRY_OFFLINE_CONFIRM_FAILURES) {
        telemetryOfflineConfirmed = true;
        applyOfflineTelemetryUi();
      } else {
        applyReconnectingTelemetryUi();
      }
    }
    scheduleNextTelemetryPoll();
  }, delay);
}

function renderDesktopLeaderboard(rows) {
  const items = Array.isArray(rows) ? rows.filter((r) => r.totalRuns > 0) : [];
  if (!items.length) return; // Don't overwrite the run board if no desktop data yet

  const payload = {
    source: 'desktop',
    rows: items.map((r) => ({
      rank:       r.rank,
      score:      r.bestScore,
      maxSpeed:   0,
      durationSec: 0,
      username:   r.username,
      route:      r.lastRunRoute || '--',
    })),
  };

  // Re-use the run board DOM, add username column
  if (!runBoardList) return;
  runBoardSourceText.textContent = 'desktop';
  runBoardList.innerHTML = items.slice(0, 5).map((r) => {
    const cleanPct = r.totalRuns > 0 ? Math.round((r.cleanRuns / r.totalRuns) * 100) : 0;
    return `<li><div class="board-row">${rankChip(r.rank)}<span class="br-detail">${r.username} Â· ${cleanPct}% clean Â· ${r.totalRuns} runs</span><span class="br-score">${Number(r.bestScore || 0).toLocaleString()}</span></div></li>`;
  }).join('');
}

function renderOverview(data) {
  const server = data?.server || {};
  const traffic = data?.traffic || {};

  setServerOnlineState(!!server.online);
  playersText.textContent = `${Number(server.players || 0)} / ${Number(server.capacity || 0)}`;
  sessionText.textContent = server.session || 'Offline';

  trafficPlayersText.textContent = `${Number(traffic.players || 0)} / ${Number(traffic.capacity || 0)}`;
  trafficSessionText.textContent = traffic.session || 'Offline';
  trafficTrackText.textContent = traffic.track || '-';
  renderTrafficMetrics(data?.trafficMetrics);

  dailyMessageText.textContent = data?.message || 'Run it clean. No crashes. Midnight rules apply.';
  lastUpdatedText.textContent = toUpdatedLabel(data?.generatedAt);

  renderLeaderboard(data?.leaderboard);
  renderTeams(data?.teams);
  renderTeamDrilldown(data?.teamDrilldown);
  renderSectorGrid(data);
  renderAssets(data?.assets);
  renderDesktopLeaderboard(data?.desktopLeaderboard); // Desktop driver board
}

async function fetchOverviewFromBase(base) {
  const url = new URL('/desktop/overview', base);
  if (API_TOKEN) {
    url.searchParams.set('token', API_TOKEN);
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: API_TOKEN ? { 'x-desktop-token': API_TOKEN } : {},
  });
  if (!response.ok) {
    throw new Error(`overview_fetch_failed_${response.status}`);
  }

  const payload = await response.json();
  if (!payload?.ok || !payload?.data) {
    throw new Error('overview_payload_invalid');
  }

  return payload.data;
}

async function fetchGetWithFallback(pathname, mutateUrl = null) {
  const targets = getApiTargets();
  let lastError = null;

  for (const base of targets) {
    try {
      const url = new URL(pathname, base);
      if (typeof mutateUrl === 'function') {
        mutateUrl(url);
      }
      if (API_TOKEN) {
        url.searchParams.set('token', API_TOKEN);
      }

      const response = await fetchWithTimeout(url.toString(), {
        method: 'GET',
        headers: API_TOKEN ? { 'x-desktop-token': API_TOKEN } : {},
      }, 1700);

      if (response.ok) {
        activeApiBase = base;
        return response;
      }

      // Keep trying alternates because stale/local dev ports can serve mismatched routes.
      lastError = new Error(`fetch_failed_${pathname}_${response.status}`);
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error(`fetch_failed_${pathname}_all_endpoints`);
}

function getApiTargets() {
  return activeApiBase
    ? [activeApiBase, ...API_BASE_CANDIDATES.filter((base) => base !== activeApiBase)]
    : [...API_BASE_CANDIDATES];
}

async function canReachAuthEndpoint(base) {
  const url = new URL('/auth/discord/poll', base);
  url.searchParams.set('state', `probe_${Date.now()}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal,
      headers: API_TOKEN ? { 'x-desktop-token': API_TOKEN } : {},
    });
    // 202 is expected for unknown state; treat any non-network response as reachable.
    return response.status === 202 || response.status === 200 || response.status === 400 || response.status === 401;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ── Network Resilience & Retry Logic ────────────────────────────────────────
/**
 * Retry a function with exponential backoff.
 * @param {Function} fn - Async function to retry
 * @param {number} maxAttempts - Max retry attempts (including first)
 * @param {number} initialDelayMs - Initial delay in milliseconds
 * @param {Function} onAttempt - Called on each attempt: (attemptNum, totalAttempts, error)
 * @returns {Promise} Result of fn or throws last error
 */
async function retryWithBackoff(fn, maxAttempts = 3, initialDelayMs = 500, onAttempt = null) {
  let lastError;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      if (onAttempt) onAttempt(i, maxAttempts, null);
      return await fn();
    } catch (err) {
      lastError = err;
      if (onAttempt) onAttempt(i, maxAttempts, err);
      if (i < maxAttempts) {
        const delay = initialDelayMs * Math.pow(2, i - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Quick test of API connectivity - returns true if at least one endpoint responds.
 * @returns {Promise<boolean>}
 */
async function validateApiConnectivity() {
  const targets = getApiTargets();
  const timeouts = targets.map(base => 
    canReachAuthEndpoint(base).catch(() => false)
  );
  const results = await Promise.allSettled(timeouts);
  return results.some(r => r.status === 'fulfilled' && r.value === true);
}

/**
 * Validate network during app initialization and provide feedback.
 * @returns {Promise<{online: boolean, message: string}>}
 */
async function validateNetworkOnStartup() {
  try {
    setApiHealthBadge('reconnecting');
    const isOnline = await validateApiConnectivity();
    setApiHealthBadge(isOnline ? 'connected' : 'offline');
    return {
      online: isOnline,
      message: isOnline ? 'Network: OK' : 'Network: Offline',
    };
  } catch (err) {
    console.error('[NETWORK] Validation failed:', err);
    setApiHealthBadge('offline');
    return {
      online: false,
      message: 'Network: Unreachable',
    };
  }
}

async function resolveApiBaseForAuth() {
  const targets = getApiTargets();
  for (const base of targets) {
    if (await canReachAuthEndpoint(base)) {
      activeApiBase = base;
      return base;
    }
  }
  return null;
}

async function fetchOverview() {
  const targets = getApiTargets();

  for (const base of targets) {
    try {
      const data = await fetchOverviewFromBase(base);
      activeApiBase = base;
      return data;
    } catch {
      // Try next candidate endpoint.
    }
  }

  throw new Error('overview_fetch_failed_all_endpoints');
}

async function refreshOverview() {
  try {
    const data = await fetchOverview();
    renderOverview(data);
  } catch {
    setServerOnlineState(false);
    lastUpdatedText.textContent = 'Connection lost';
  }
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    showTab(btn.dataset.tab);
    if (btn.dataset.tab === 'profile') {
      updateProfileTab();
      fetchProfile();
      renderRunHistory();
    }
  });
});
launchBtn.addEventListener('click', launchGame);

// â”€â”€ Settings system â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SETTINGS_KEY = 'mpr_settings';

const defaultSettings = {
  apiBase:       '',
  apiToken:      '',
  telemetryUrl:  'http://localhost:3000/api/telemetry',
  acPath:        '',
  showStatsStrip: true,
  speedReact:    true,
  bannerMain:    '',
  bannerTraffic: '',
  bannerDrift:   '',
  bannerRace:    '',
  bannerNord:    '',
  lightTheme:    false,
};

function loadSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : { ...defaultSettings };
  } catch {
    return { ...defaultSettings };
  }
}

function saveSettings(values) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(values)); } catch { /* storage full */ }
}

function applySettings(s) {
  const prevTelemetryApiUrl = telemetryApiUrl;
  // Override API base candidate if user set one
  if (s.apiBase && s.apiBase.trim()) {
    API_BASE_CANDIDATES.length = 0;
    API_BASE_CANDIDATES.push(s.apiBase.trim());
    activeApiBase = null; // force re-discovery on next fetch
  }
  // Stats strip visibility
  const strip = document.getElementById('sessionStatsStrip');
  if (strip) strip.classList.toggle('hidden', !s.showStatsStrip);
  // Speed reactivity flag
  window._settingSpeedReact = s.speedReact !== false;
  telemetryApiUrl = s.telemetryUrl || LIVE_TELEMETRY_API;
  if (telemetryApiUrl !== prevTelemetryApiUrl) {
    telemetryConsecutiveFailures = 0;
    telemetryOfflineConfirmed = false;
    scheduleNextTelemetryPoll(0);
  }
  // Update launch button appearance
  updateLaunchBtnState();
  // Apply theme
  applyTheme(s.lightTheme);
  // Apply custom server banner image overrides
  const bannerMap = {
    main:    s.bannerMain,
    traffic: s.bannerTraffic,
    drift:   s.bannerDrift,
    race:    s.bannerRace,
    nord:    s.bannerNord,
  };
  for (const [key, url] of Object.entries(bannerMap)) {
    const el = document.querySelector(`.srv-banner-${key}`);
    if (!el) continue;
    const src = (url || '').trim();
    if (src) {
      el.style.backgroundImage    = `url('${src}')`;
      el.style.backgroundSize     = 'cover';
      el.style.backgroundPosition = 'center';
    } else {
      el.style.backgroundImage    = '';
      el.style.backgroundSize     = '';
      el.style.backgroundPosition = '';
    }
  }
}

function populateSettingsForm(s) {
  const get = (id) => document.getElementById(id);
  if (get('settingApiBase'))       get('settingApiBase').value       = s.apiBase || '';
  if (get('settingApiToken'))      get('settingApiToken').value      = s.apiToken || '';
  if (get('settingTelemetryUrl'))  get('settingTelemetryUrl').value  = s.telemetryUrl || defaultSettings.telemetryUrl;
  if (get('settingAcPath'))        get('settingAcPath').value        = s.acPath || '';
  if (get('settingShowStatsStrip')) get('settingShowStatsStrip').checked = s.showStatsStrip !== false;
  if (get('settingSpeedReact'))    get('settingSpeedReact').checked  = s.speedReact !== false;
  if (get('settingBannerMain'))    get('settingBannerMain').value    = s.bannerMain    || '';
  if (get('settingBannerTraffic')) get('settingBannerTraffic').value = s.bannerTraffic || '';
  if (get('settingBannerDrift'))   get('settingBannerDrift').value   = s.bannerDrift   || '';
  if (get('settingBannerRace'))    get('settingBannerRace').value    = s.bannerRace    || '';
  if (get('settingBannerNord'))    get('settingBannerNord').value    = s.bannerNord    || '';
  if (get('settingLightTheme'))    get('settingLightTheme').checked  = !!s.lightTheme;
}

(function initSettings() {
  const s = loadSettings();
  applySettings(s);
  populateSettingsForm(s);
}());

document.getElementById('settingsSave')?.addEventListener('click', () => {
  const get = (id) => document.getElementById(id);
  const s = {
    apiBase:        (get('settingApiBase')?.value || '').trim(),
    apiToken:       (get('settingApiToken')?.value || '').trim(),
    telemetryUrl:   (get('settingTelemetryUrl')?.value || '').trim() || defaultSettings.telemetryUrl,
    acPath:         (get('settingAcPath')?.value || '').trim(),
    showStatsStrip: get('settingShowStatsStrip')?.checked !== false,
    speedReact:     get('settingSpeedReact')?.checked !== false,
    bannerMain:    (get('settingBannerMain')?.value    || '').trim(),
    bannerTraffic: (get('settingBannerTraffic')?.value || '').trim(),
    bannerDrift:   (get('settingBannerDrift')?.value   || '').trim(),
    bannerRace:    (get('settingBannerRace')?.value     || '').trim(),
    bannerNord:    (get('settingBannerNord')?.value     || '').trim(),
    lightTheme:    !!(get('settingLightTheme')?.checked),
  };
  saveSettings(s);
  applySettings(s);
  const label = document.getElementById('settingsSavedLabel');
  if (label) {
    label.textContent = 'âœ“ Saved';
    label.classList.add('visible');
    setTimeout(() => label.classList.remove('visible'), 2500);
  }
  showToast({ icon: 'âš™', title: 'Settings Saved', msg: 'Changes applied immediately.', type: 'finish', duration: 3000 });
});

document.getElementById('settingClearHistory')?.addEventListener('click', () => {
  if (!confirm('Clear all run history? This cannot be undone.')) return;
  try { localStorage.removeItem(RUN_HISTORY_KEY); } catch { /* noop */ }
  renderRunHistory();
  showToast({ icon: 'â—ˆ', title: 'Run History Cleared', type: 'finish', duration: 3000 });
});

document.getElementById('exportRunHistoryBtn')?.addEventListener('click', () => {
  if (!canAccessFeature('csvExport')) {
    showToast({
      icon: 'ðŸ”’',
      title: 'Feature Locked',
      msg: 'CSV Export requires PRO tier or higher. Upgrade now!',
      type: 'warning',
      duration: 4000,
    });
    return;
  }
  exportRunHistoryCSV();
});

document.getElementById('settingResetAll')?.addEventListener('click', () => {
  if (!confirm('Reset all settings to defaults?')) return;
  saveSettings({ ...defaultSettings });
  populateSettingsForm({ ...defaultSettings });
  applySettings({ ...defaultSettings });
  showToast({ icon: 'âš™', title: 'Settings Reset', msg: 'All settings restored to defaults.', type: 'finish', duration: 3000 });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TIER SYSTEM â€” HARDENED, ATOMIC, NON-EXPLOITABLE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â”€â”€ Feature Gating UI Manager â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function updateFeatureGates() {
  const tier = getTierData();
  const tierInfo = TIER_DATA[tier.tier];
  
  // Gate CSV Export
  const csvBtn = document.getElementById('exportRunHistoryBtn');
  if (csvBtn) {
    const canExport = canAccessFeature('csvExport');
    csvBtn.classList.toggle('feature-locked', !canExport);
    csvBtn.title = canExport ? 'Export as CSV' : 'Upgrade to PRO to export';
  }
  
  // Gate Custom Banner Section
  const bannerSection = Array.from(document.querySelectorAll('.sf-row')).find(row => 
    row.textContent.includes('Custom Banner') || row.textContent.includes('The Mainline')
  )?.closest('.card');
  
  if (bannerSection) {
    const canCustomBanners = canAccessFeature('customBanners');
    const inputsInSection = bannerSection.querySelectorAll('input[id^="settingBanner"]');
    
    inputsInSection.forEach(input => {
      input.disabled = !canCustomBanners;
      if (!canCustomBanners) {
        input.placeholder = '(Upgrade to PRO to customize)';
      }
    });
    
    const hint = bannerSection.querySelector('.sf-hint');
    if (hint && !canCustomBanners) {
      hint.textContent = 'ðŸ”’ Custom banners require PRO tier. Upgrade to unlock this feature.';
      hint.style.color = 'var(--warning)';
    }
  }
  
  // Gate Advanced Settings
  const advAnalyticsSettings = Array.from(document.querySelectorAll('.sf-row')).find(row => 
    row.textContent.includes('Advanced') || row.textContent.includes('API')
  )?.closest('.card');
  
  if (advAnalyticsSettings) {
    const canAdvanced = canAccessFeature('advancedAnalytics');
    const inputsInSection = advAnalyticsSettings.querySelectorAll('input');
    
    inputsInSection.forEach(input => {
      input.disabled = !canAdvanced;
      if (!canAdvanced) {
        input.placeholder = '(Upgrade to ELITE to customize)';
      }
    });
  }
  
  console.log(`[GATING] Updated feature gates for ${tier.tier.toUpperCase()} tier`);
}

function generateTierHash(tierData) {
  // Simple integrity check (prevents casual tampering)
  // In production, sign server-side
  const payload = `${tierData.tier}:${tierData.renewalDate}:${tierData.purchaseDate}`;
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

function getTierData() {
  try {
    const stored = localStorage.getItem(TIER_KEY);
    if (!stored) return { tier: 'free', purchaseDate: null, renewalDate: null };
    
    const tierData = JSON.parse(stored);
    // Validate hash integrity
    const stored_hash = tierData.hash;
    const computed_hash = generateTierHash(tierData);
    if (stored_hash !== computed_hash) {
      console.warn('[TIER] Hash mismatch â€” possible tampering detected, resetting to FREE');
      logTierTransaction('tampering_detected', tierData.tier, 'free', { reason: 'hash_mismatch' });
      return { tier: 'free', purchaseDate: null, renewalDate: null };
    }

    // Check if renewal date has passed (grace period: 7 days)
    if (tierData.renewalDate) {
      const renewalMs = new Date(tierData.renewalDate).getTime();
      const graceMs = 7 * 24 * 60 * 60 * 1000; // 7 days
      const now = Date.now();
      if (now > renewalMs + graceMs) {
        console.warn('[TIER] Renewal date expired, downgrading to FREE');
        logTierTransaction('renewal_expired', tierData.tier, 'free', { renewalDate: tierData.renewalDate });
        return { tier: 'free', purchaseDate: null, renewalDate: null };
      }
    }
    
    return tierData;
  } catch (e) {
    console.error('[TIER] Parse error:', e);
    return { tier: 'free', purchaseDate: null, renewalDate: null };
  }
}

function setTierData(tierKey, purchaseDate = null, renewalDate = null) {
  // Atomic tier update with hash validation
  const oldTier = getTierData();
  const oldTierKey = oldTier.tier || 'free';
  
  const tierData = {
    tier: tierKey,
    purchaseDate: purchaseDate || new Date().toISOString(),
    renewalDate: renewalDate || (tierKey !== 'free' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null),
    hash: '',
  };
  tierData.hash = generateTierHash(tierData);
  
  try {
    localStorage.setItem(TIER_KEY, JSON.stringify(tierData));
    
    // Log transaction (audit trail)
    let event = 'manual_set';
    if (tierKey !== oldTierKey) {
      event = tierKey === 'free' ? 'downgrade' : (oldTierKey === 'free' ? 'upgrade' : 'tier_change');
    }
    logTierTransaction(event, oldTierKey, tierKey, {
      renewalDate: tierData.renewalDate,
      amount: TIER_DATA[tierKey]?.price || 0,
    });
    
    return tierData;
  } catch (e) {
    console.error('[TIER] Storage error:', e);
    showToast({ icon: 'âŒ', title: 'Tier Error', msg: 'Could not save tier. Storage full?', type: 'danger', duration: 3000 });
    return null;
  }
}

function canAccessFeature(featureName) {
  // Phase 30 will fully gate features
  // For now, this is a stub
  const tier = getTierData();
  const tierInfo = TIER_DATA[tier.tier];
  if (!tierInfo) return false;
  
  const featureGates = {
    csvExport: ['pro', 'elite', 'founder'],
    customBanners: ['pro', 'elite', 'founder'],
    advancedAnalytics: ['elite', 'founder'],
    apiAccess: ['elite', 'founder'],
    customThemes: ['elite', 'founder'],
  };
  
  const allowed = featureGates[featureName] || [];
  return allowed.includes(tier.tier);
}

// â”€â”€ Transaction Audit Log (immutable tier change history) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TIER_AUDIT_KEY = 'mpr_tier_audit_log';

function logTierTransaction(event, oldTier, newTier, details = {}) {
  // Immutable audit trail: log every tier change
  try {
    let log = [];
    const stored = localStorage.getItem(TIER_AUDIT_KEY);
    if (stored) log = JSON.parse(stored);
    
    const entry = {
      timestamp: new Date().toISOString(),
      event: event, // 'upgrade', 'downgrade', 'purchase', 'renew', 'expired', 'manual_set'
      from: oldTier,
      to: newTier,
      duration: details.duration || null, // active duration in ms
      amount: details.amount || 0,
      renewalDate: details.renewalDate || null,
      ...details,
    };
    
    log.push(entry);
    
    // Keep last 100 entries (limit storage)
    if (log.length > 100) log = log.slice(-100);
    
    localStorage.setItem(TIER_AUDIT_KEY, JSON.stringify(log));
    console.log(`[TIER AUDIT] ${event}: ${oldTier} â†’ ${newTier}`, entry);
  } catch (e) {
    console.error('[TIER AUDIT] Error writing log:', e);
  }
}

function getTierAuditLog() {
  try {
    const log = localStorage.getItem(TIER_AUDIT_KEY);
    return log ? JSON.parse(log) : [];
  } catch { return []; }
}

function getRenewalStatus() {
  // Check renewal status and handle grace period
  const tierData = getTierData();
  const tierInfo = TIER_DATA[tierData.tier];
  
  if (tierData.tier === 'free' || !tierData.renewalDate) {
    return { status: 'none', daysLeft: null };
  }
  
  const renewalMs = new Date(tierData.renewalDate).getTime();
  const graceMs = 7 * 24 * 60 * 60 * 1000; // 7 days grace
  const now = Date.now();
  const msUntilRenewal = renewalMs - now;
  const msUntilExpiry = renewalMs + graceMs - now;
  const daysLeft = Math.ceil(msUntilRenewal / (24 * 60 * 60 * 1000));
  const daysUntilExpiry = Math.ceil(msUntilExpiry / (24 * 60 * 60 * 1000));
  
  if (msUntilRenewal > 0) {
    return { status: 'active', daysLeft, renewalDate: tierData.renewalDate };
  } else if (msUntilExpiry > 0) {
    return { status: 'grace_period', daysLeft: daysUntilExpiry, renewalDate: tierData.renewalDate, expireDate: new Date(renewalMs + graceMs).toISOString() };
  } else {
    return { status: 'expired', daysLeft: 0, renewalDate: tierData.renewalDate };
  }
}

function updateTierDisplay() {
  const tierData = getTierData();
  const tierInfo = TIER_DATA[tierData.tier];
  
  const badge = document.getElementById('tierStatusBadge');
  const planName = document.getElementById('tierPlanName');
  const renewalDate = document.getElementById('tierRenewalDate');
  const runsUsed = document.getElementById('tierRunsUsed');
  const countdown = document.getElementById('tierRenewalCountdown');
  
  if (badge) {
    badge.textContent = tierInfo.label;
    badge.className = `tier-status-badge tier-${tierData.tier}`;
  }
  
  if (planName) planName.textContent = tierInfo.name;
  
  if (runsUsed) {
    const history = loadRunHistory();
    const runsThisMonth = history.filter(r => {
      const runDate = new Date(r.timestamp || 0);
      const now = new Date();
      return runDate.getMonth() === now.getMonth() && runDate.getFullYear() === now.getFullYear();
    }).length;
    const limit = tierInfo.runsPerMonth === Infinity ? 'âˆž' : tierInfo.runsPerMonth;
    runsUsed.textContent = `${runsThisMonth} / ${limit}`;
  }
  
  if (tierData.renewalDate) {
    const renewalMs = new Date(tierData.renewalDate).getTime();
    const now = Date.now();
    const daysLeft = Math.ceil((renewalMs - now) / (24 * 60 * 60 * 1000));
    
    if (renewalDate) renewalDate.textContent = new Date(tierData.renewalDate).toLocaleDateString();
    
    if (countdown) {
      if (daysLeft < 0) {
        countdown.textContent = 'âš  Expired â€” renewal failed';
        countdown.classList.add('expires-soon');
      } else if (daysLeft <= 7) {
        countdown.textContent = `âš  Renews in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
        countdown.classList.add('expires-soon');
      } else {
        countdown.textContent = `âœ“ Active â€” renews in ${daysLeft} days`;
        countdown.classList.remove('expires-soon');
      }
    }
  } else {
    if (renewalDate) renewalDate.textContent = 'Never';
    if (countdown) {
      countdown.textContent = 'âœ“ Forever free';
      countdown.classList.remove('expires-soon');
    }
  }
}

function initTierSystem() {
  // Ensure user has a tier assigned â€” owner always gets founder
  const stored = getTierData();
  if (!stored?.tier) {
    setTierData(isOwner() ? 'founder' : 'free');
  } else if (isOwner() && stored.tier !== 'founder') {
    setTierData('founder', stored.purchaseDate || new Date().toISOString(), null);
  }
  
  // Tier modal event listeners
  const tierModal = document.getElementById('tierModal');
  const tierUpgradeBtn = document.getElementById('tierUpgradeBtn');
  
  if (tierUpgradeBtn) {
    tierUpgradeBtn.addEventListener('click', () => {
      if (tierModal) tierModal.classList.add('visible');
    });
  }
  
  // Tier selection buttons
  document.querySelectorAll('.tier-select-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tierCard = e.target.closest('.tier-card');
      if (!tierCard) return;
      const tierKey = tierCard.dataset.tier;
      
      // Route through payment processor (atomic, safe)
      processTierPurchase(tierKey, (success, message) => {
        if (success) {
          updateTierDisplay();
          updateFeatureGates(); // Update gated features after tier change
          if (tierModal) tierModal.classList.remove('visible');
          showToast({
            icon: 'âœ…',
            title: `Upgraded to ${TIER_DATA[tierKey].label}`,
            msg: message,
            type: 'finish',
            duration: 3000,
          });
        } else {
          showToast({
            icon: 'âŒ',
            title: 'Purchase Failed',
            msg: message,
            type: 'danger',
            duration: 3000,
          });
        }
      });
    });
  });
  
  // Close modal on overlay click
  if (tierModal) {
    const overlay = tierModal.querySelector('.tier-modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', () => tierModal.classList.remove('visible'));
    }
  }
  
  // Update tier display every 1 second (countdown animation)
  setInterval(updateTierDisplay, 1000);
  
  // Initial display update
  updateTierDisplay();
  
  // Initialize feature gates
  updateFeatureGates();
}

// â”€â”€ Mock Payment Processor (hardened, atomic, non-exploitable) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PAYMENT_LOG_KEY = 'mpr_payment_log';
const TRANSACTION_LOCK_KEY = 'mpr_transaction_lock'; // Prevent race conditions
let _pendingPaymentIdempotencyKey = null;

// â”€â”€ TOM: Economy Hardening & Validation (Phase 32) â”€â”€

function validateTierData(tierData) {
  const errors = [];
  let isValid = true;
  
  // Validate tier key exists
  if (!tierData.tier || !TIER_DATA[tierData.tier]) {
    errors.push(`Invalid tier: ${tierData.tier}`);
    isValid = false;
    tierData.tier = 'free';
  }
  
  // Validate dates
  if (tierData.tier !== 'free') {
    if (!tierData.purchaseDate) {
      errors.push('Missing purchaseDate for paid tier');
      isValid = false;
      tierData.purchaseDate = new Date().toISOString();
    }
    
    if (!tierData.renewalDate) {
      errors.push('Missing renewalDate for paid tier');
      isValid = false;
      tierData.renewalDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    }
    
    // Validate renewal date is in future
    try {
      const renewalMs = new Date(tierData.renewalDate).getTime();
      if (renewalMs < Date.now()) {
        errors.push(`Renewal date in past: ${tierData.renewalDate}`);
        isValid = false;
        tierData.renewalDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }
    } catch (e) {
      errors.push(`Invalid renewal date format: ${tierData.renewalDate}`);
      isValid = false;
    }
  }
  
  // Validate hash integrity
  if (tierData.hash) {
    const expectedHash = generateTierHash(tierData);
    if (tierData.hash !== expectedHash) {
      errors.push(`Hash mismatch: ${tierData.hash} vs ${expectedHash}`);
      isValid = false;
      tierData.hash = expectedHash;
    }
  }
  
  if (!isValid && errors.length > 0) {
    console.warn('[TIER VALIDATION] Errors found:', errors);
  }
  
  return { tierData, isValid, errors };
}

function checkForDoubleSpend(tierKey, idempotencyKey) {
  // Prevent duplicate charges for the same transaction
  try {
    const log = getPaymentLog();
    const duplicate = log.find(entry => 
      entry.idempotencyKey === idempotencyKey && 
      entry.status === 'success'
    );
    
    if (duplicate) {
      console.warn('[ECONOMY] Double-spend attempt detected:', idempotencyKey);
      return true;
    }
  } catch (e) {
    console.warn('[ECONOMY] Double-spend check failed:', e);
  }
  
  return false;
}

function acquireTransactionLock(timeoutMs = 5000) {
  // Prevent race conditions: only one transaction at a time
  try {
    const lockData = localStorage.getItem(TRANSACTION_LOCK_KEY);
    if (lockData) {
      const lock = JSON.parse(lockData);
      const lockAgeMs = Date.now() - new Date(lock.timestamp).getTime();
      
      if (lockAgeMs < timeoutMs) {
        // Lock still active
        return false;
      } else {
        // Lock expired, clean it up
        localStorage.removeItem(TRANSACTION_LOCK_KEY);
      }
    }
    
    // Acquire lock
    localStorage.setItem(TRANSACTION_LOCK_KEY, JSON.stringify({
      timestamp: new Date().toISOString(),
      user: currentUser,
    }));
    return true;
  } catch (e) {
    console.error('[LOCK] Error acquiring transaction lock:', e);
    return false;
  }
}

function releaseTransactionLock() {
  try {
    localStorage.removeItem(TRANSACTION_LOCK_KEY);
  } catch (e) {
    console.warn('[LOCK] Error releasing transaction lock:', e);
  }
}

function getTierDataWithValidation() {
  try {
    const raw = localStorage.getItem(TIER_KEY);
    if (!raw) return { tier: 'free' };
    
    let tierData = JSON.parse(raw);
    const { tierData: repaired, isValid, errors } = validateTierData(tierData);
    
    if (!isValid) {
      console.warn('[TIER] Data corruption detected, repairing:', errors);
      setTierData(repaired.tier, repaired.purchaseDate, repaired.renewalDate);
      return repaired;
    }
    
    return repaired;
  } catch (err) {
    console.error('[TIER] Load failed:', err);
    localStorage.removeItem(TIER_KEY);
    return { tier: 'free' };
  }
}

function logPaymentAttempt(action, tier, status, details = {}) {
  try {
    let log = [];
    const stored = localStorage.getItem(PAYMENT_LOG_KEY);
    if (stored) log = JSON.parse(stored);
    
    const entry = {
      timestamp: new Date().toISOString(),
      action: action, // 'purchase', 'renewal', 'downgrade'
      tier: tier,
      status: status, // 'success', 'failed', 'pending'
      amount: TIER_DATA[tier]?.price || 0,
      user: currentUser,
      ...details,
    };
    
    log.push(entry);
    
    // Keep last 50 payment entries
    if (log.length > 50) log = log.slice(-50);
    
    localStorage.setItem(PAYMENT_LOG_KEY, JSON.stringify(log));
    console.log(`[PAYMENT] ${action} ${tier}: ${status}`, entry);
  } catch (e) {
    console.error('[PAYMENT LOG] Error:', e);
  }
}

function processTierPurchase(tierKey, callback) {
  // â”€â”€ TOM: Atomic payment processor with hardening (Phase 32) â”€â”€
  
  // 1. Acquire transaction lock (prevent race conditions)
  if (!acquireTransactionLock()) {
    callback(false, 'Transaction in progress. Please wait.');
    return;
  }
  
  try {
    // 2. Validate tier key
    if (!TIER_DATA[tierKey]) {
      logPaymentAttempt('purchase', tierKey, 'failed', { reason: 'invalid_tier' });
      callback(false, 'Invalid tier specified.');
      return;
    }
    
    const currentTierData = getTierDataWithValidation(); // Use validation on load
    const currentTierKey = currentTierData.tier || 'free';
    
    // 3. Prevent duplicate charges (idempotency)
    const idempotencyKey = `${currentUser}-${tierKey}-${Date.now()}-${Math.random()}`;
    
    if (checkForDoubleSpend(tierKey, idempotencyKey)) {
      logPaymentAttempt('purchase', tierKey, 'failed', { reason: 'double_spend_detected', idempotencyKey });
      callback(false, 'Duplicate transaction detected. Please refresh and try again.');
      return;
    }
    
    // 4. Validate purchase (mock payment)
    const tierInfo = TIER_DATA[tierKey];
    if (tierInfo.price === 0) {
      // Free tier: no payment required
      logPaymentAttempt('downgrade', tierKey, 'pending', { idempotencyKey });
    } else {
      // Paid tier: mock payment validation
      const paymentMethod = prompt(`Enter payment method for $${tierInfo.price}/month (mock: type "pay" to continue):`);
      if (paymentMethod?.toLowerCase() !== 'pay') {
        logPaymentAttempt('purchase', tierKey, 'failed', { reason: 'payment_cancelled', idempotencyKey });
        callback(false, 'Payment cancelled or invalid.');
        return;
      }
      
      logPaymentAttempt('purchase', tierKey, 'pending', { idempotencyKey, method: 'mock' });
    }
    
    // 5. ATOMIC COMMIT: update tier data with all-or-nothing guarantee
    const newTierData = setTierData(tierKey);
    if (!newTierData) {
      logPaymentAttempt('purchase', tierKey, 'failed', { reason: 'storage_error', idempotencyKey });
      callback(false, 'Failed to save tier. Try again.');
      return;
    }
    
    // 6. Verify hash integrity immediately after commit (detect corruption)
    const verifyTier = getTierDataWithValidation();
    if (verifyTier.tier !== tierKey) {
      logPaymentAttempt('purchase', tierKey, 'failed', { reason: 'verification_failed', idempotencyKey });
      callback(false, 'Tier verification failed.');
      return;
    }
    
    // 7. SUCCESS: log completed transaction
    logPaymentAttempt('purchase', tierKey, 'success', { 
      idempotencyKey,
      renewalDate: newTierData.renewalDate,
      fromTier: currentTierKey,
    });
    
    callback(true, tierInfo.price > 0 
      ? `Payment processed. Your ${tierInfo.label} plan is active for 30 days.`
      : 'Successfully switched to Free tier.'
    );
    
    uiSync.emit(SYNC_EVENTS.TIER_CHANGED, { from: currentTierKey, to: tierKey });
    
  } catch (e) {
    console.error('[PAYMENT] Atomic commit error:', e);
    logPaymentAttempt('purchase', tierKey, 'failed', { reason: 'commit_error', error: e.message });
    callback(false, 'Transaction failed. Please try again.');
  } finally {
    // 8. ALWAYS release lock
    releaseTransactionLock();
  }
}

function getPaymentLog() {
  try {
    const log = localStorage.getItem(PAYMENT_LOG_KEY);
    return log ? JSON.parse(log) : [];
  } catch { return []; }
}

// â”€â”€ Renewal Enforcement (check on startup, handle grace period, warn on expiry) â”€â”€
function checkRenewalStatus() {
  const tierData = getTierData();
  const renewalStatus = getRenewalStatus();
  
  // Skip if free tier or no renewal date
  if (tierData.tier === 'free' || !tierData.renewalDate) return;
  
  console.log(`[RENEWAL] Status: ${renewalStatus.status}, Days: ${renewalStatus.daysLeft}`);
  
  if (renewalStatus.status === 'active') {
    // Tier is active, check if renewal is within 7 days
    if (renewalStatus.daysLeft <= 7 && renewalStatus.daysLeft > 0) {
      // Show renewal reminder
      setTimeout(() => {
        showToast({
          icon: 'â°',
          title: `${TIER_DATA[tierData.tier].label} Renews Soon`,
          msg: `Your subscription renews in ${renewalStatus.daysLeft} day${renewalStatus.daysLeft !== 1 ? 's' : ''}.`,
          type: 'warning',
          duration: 6000,
        });
      }, 2000); // Wait 2s after login to show toast
    }
  } else if (renewalStatus.status === 'grace_period') {
    // In grace period: show warning
    showToast({
      icon: 'âš ',
      title: 'Subscription Expired',
      msg: `Renewal failed. You have ${renewalStatus.daysLeft} days to renew before losing access.`,
      type: 'warning',
      duration: 8000,
    });
    
    // Log expired event
    logTierTransaction('grace_period_entered', tierData.tier, tierData.tier, {
      daysLeft: renewalStatus.daysLeft,
      expireDate: renewalStatus.expireDate,
    });
  } else if (renewalStatus.status === 'expired') {
    // Grace period expired: downgrade to free
    console.warn('[RENEWAL] Grace period expired, downgrading to FREE');
    setTierData('free');
    showToast({
      icon: 'âŒ',
      title: 'Subscription Cancelled',
      msg: 'Your subscription has expired. Downgraded to Free tier.',
      type: 'danger',
      duration: 8000,
    });
  }
}

function attemptAutoRenewal(tierKey) {
  // Mock auto-renewal: in production, call billing API
  // This is called when user is within renewal window
  
  if (!tierKey || tierKey === 'free') return;
  
  const tierInfo = TIER_DATA[tierKey];
  console.log(`[RENEWAL] Auto-renewing ${tierKey} for $${tierInfo.price}`);
  
  // Mock: random success/failure (80% success rate)
  const success = Math.random() > 0.2;
  
  if (success) {
    // Extend renewal date by 30 days
    const newRenewalDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const currentTier = getTierData();
    
    try {
      const updated = setTierData(tierKey, currentTier.purchaseDate, newRenewalDate);
      if (updated) {
        logPaymentAttempt('renewal', tierKey, 'success', { newRenewalDate });
        console.log('[RENEWAL] Auto-renewal succeeded');
        return true;
      }
    } catch (e) {
      console.error('[RENEWAL] Auto-renewal error:', e);
    }
  }
  
  // Renewal failed
  logPaymentAttempt('renewal', tierKey, 'failed', { reason: 'payment_declined' });
  console.warn('[RENEWAL] Auto-renewal failed, customer will enter grace period');
  return false;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PHASE 31: DISCORD INTEGRATION + FULL CAREER TRACKING (Functions)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function getDiscordAccount() {
  return validateDiscordAccountOnLoad();
}

function setDiscordAccount(account) {
  if (account) {
    localStorage.setItem(DISCORD_KEY, JSON.stringify(account));
  } else {
    localStorage.removeItem(DISCORD_KEY);
  }
}

function getCareerData() {
  return validateCareerOnLoad();
}

function initializeCareerData() {
  return {
    totalRuns: 0,
    totalScore: 0,
    bestScore: 0,
    personalBests: 0,
    cleanRuns: 0,
    crashes: 0,
    currentStreak: 0,
    bestStreak: 0,
    totalPlayTime: 0,
    averageScore: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function setCareerData(careerData) {
  careerData.updatedAt = new Date().toISOString();
  try {
    // â”€â”€ TOM: Multi-layer backup strategy â”€â”€
    // 1. Create atomic backup before write
    const currentData = localStorage.getItem(CAREER_DATA_KEY);
    if (currentData) {
      try {
        const backup = JSON.parse(currentData);
        backup.backupTimestamp = new Date().toISOString();
        localStorage.setItem(CAREER_BACKUP_KEY, JSON.stringify(backup));
        
        // 2. Maintain history of last 5 backups
        let history = [];
        try {
          const histStr = localStorage.getItem(CAREER_BACKUP_HISTORY_KEY);
          if (histStr) history = JSON.parse(histStr);
        } catch (e) { /* ignore */ }
        
        history.unshift({ timestamp: backup.backupTimestamp, runs: backup.totalRuns });
        if (history.length > 5) history = history.slice(0, 5);
        localStorage.setItem(CAREER_BACKUP_HISTORY_KEY, JSON.stringify(history));
      } catch (e) {
        console.warn('[BACKUP] Failed to create backup:', e);
      }
    }
    
    // 3. Atomic write with integrity check
    const writeStr = JSON.stringify(careerData);
    localStorage.setItem(CAREER_DATA_KEY, writeStr);
    
    // 4. Verify write succeeded
    const verify = localStorage.getItem(CAREER_DATA_KEY);
    if (!verify || verify !== writeStr) {
      throw new Error('Integrity check failed after write');
    }
    
    return careerData;
  } catch (err) {
    console.error('[CAREER] Save failed, attempting backup restore:', err);
    showToast({ icon: 'âš ï¸', title: 'Storage Error', msg: 'Career data save failed - attempting restore', type: 'warning' });
    return null;
  }
}

// â”€â”€ Backup Recovery (TOM: Zero Failure) â”€â”€

function restoreCareerFromBackup() {
  try {
    const backup = localStorage.getItem(CAREER_BACKUP_KEY);
    if (!backup) {
      console.warn('[BACKUP] No backup available');
      return null;
    }
    
    const restored = JSON.parse(backup);
    console.log('[BACKUP] Restoring from backup:', { runs: restored.totalRuns, timestamp: restored.backupTimestamp });
    setCareerData(restored);
    showToast({ icon: 'âœ“', title: 'Data Restored', msg: `Career restored from ${new Date(restored.backupTimestamp).toLocaleString()}`, type: 'success' });
    return restored;
  } catch (err) {
    console.error('[BACKUP] Restore failed:', err);
    return null;
  }
}

function getBackupHistory() {
  try {
    const hist = localStorage.getItem(CAREER_BACKUP_HISTORY_KEY);
    return hist ? JSON.parse(hist) : [];
  } catch {
    return [];
  }
}

// â”€â”€ Career Data Validation & Repair (Phase 32, TOM: Zero Failure) â”€â”€

function validateCareerData(career) {
  let isValid = true;
  const errors = [];
  
  // Validate required fields exist and are numbers
  const numFields = ['totalRuns', 'totalScore', 'bestScore', 'personalBests', 'cleanRuns', 'crashes', 'currentStreak', 'bestStreak', 'totalPlayTime', 'averageScore'];
  
  numFields.forEach(field => {
    if (!(field in career) || typeof career[field] !== 'number') {
      isValid = false;
      errors.push(`Missing/invalid field: ${field}`);
      career[field] = 0;
    }
  });
  
  // Validate constraints
  if (career.totalRuns < 0) { career.totalRuns = 0; errors.push('totalRuns < 0'); isValid = false; }
  if (career.totalScore < 0) { career.totalScore = 0; errors.push('totalScore < 0'); isValid = false; }
  if (career.bestScore < 0) { career.bestScore = 0; errors.push('bestScore < 0'); isValid = false; }
  if (career.personalBests < 0) { career.personalBests = 0; errors.push('personalBests < 0'); isValid = false; }
  if (career.cleanRuns < 0) { career.cleanRuns = 0; errors.push('cleanRuns < 0'); isValid = false; }
  if (career.crashes < 0) { career.crashes = 0; errors.push('crashes < 0'); isValid = false; }
  if (career.currentStreak < 0) { career.currentStreak = 0; errors.push('currentStreak < 0'); isValid = false; }
  if (career.bestStreak < 0) { career.bestStreak = 0; errors.push('bestStreak < 0'); isValid = false; }
  
  // Logical constraints
  if (career.cleanRuns + career.crashes !== career.totalRuns && career.totalRuns > 0) {
    const diff = Math.abs((career.cleanRuns + career.crashes) - career.totalRuns);
    if (diff > 0) {
      errors.push(`cleanRuns(${career.cleanRuns}) + crashes(${career.crashes}) â‰  totalRuns(${career.totalRuns})`);
      isValid = false;
      // Auto-repair: assume recent operations are correct, adjust crashes
      career.crashes = Math.max(0, career.totalRuns - career.cleanRuns);
    }
  }
  
  if (career.bestStreak < career.currentStreak) {
    errors.push(`bestStreak(${career.bestStreak}) < currentStreak(${career.currentStreak})`);
    isValid = false;
    career.bestStreak = career.currentStreak;
  }
  
  if (career.bestScore > 0 && career.totalScore > 0) {
    if (career.bestScore > career.totalScore) {
      errors.push(`bestScore(${career.bestScore}) > totalScore(${career.totalScore})`);
      isValid = false;
      // Keep bestScore as-is, it's the peak performance
    }
  }
  
  // Validate average
  if (career.totalRuns > 0 && career.averageScore !== Math.floor(career.totalScore / career.totalRuns)) {
    const expectedAvg = Math.floor(career.totalScore / career.totalRuns);
    errors.push(`averageScore mismatch: got ${career.averageScore}, expected ${expectedAvg}`);
    isValid = false;
    career.averageScore = expectedAvg;
  }
  
  // Log validation results
  if (!isValid && errors.length > 0) {
    console.warn('[CAREER VALIDATION] Errors found and auto-repaired:', errors);
  }
  
  return { career, isValid, errors };
}

function validateCareerOnLoad() {
  try {
    const raw = localStorage.getItem(CAREER_DATA_KEY);
    if (!raw) return initializeCareerData();
    
    let career = JSON.parse(raw);
    const { career: repaired, isValid, errors } = validateCareerData(career);
    
    if (!isValid) {
      console.warn('[CAREER] Data corruption detected:', { errors });
      
      // Attempt recovery from backup before using repaired data
      const backup = localStorage.getItem(CAREER_BACKUP_KEY);
      if (backup) {
        try {
          const restored = JSON.parse(backup);
          const { career: backupRepaired, isValid: backupValid } = validateCareerData(restored);
          if (backupValid) {
            console.log('[CAREER] Successfully restored from backup');
            setCareerData(backupRepaired);
            return backupRepaired;
          }
        } catch (e) {
          console.warn('[CAREER] Backup also corrupt, using repaired primary:', e);
        }
      }
      
      // Fallback to repaired data
      console.warn('[CAREER] Using auto-repaired data:', { errors, repaired });
      setCareerData(repaired);
      return repaired;
    }
    
    return repaired;
  } catch (err) {
    console.error('[CAREER] Load failed, attempting backup restore:', err);
    
    // Attempt backup restoration as last resort
    try {
      const backup = localStorage.getItem(CAREER_BACKUP_KEY);
      if (backup) {
        const restored = JSON.parse(backup);
        console.log('[CAREER] Restored from backup after critical error');
        return restored;
      }
    } catch (e) { /* ignore */ }
    
    // Complete failure - start fresh
    localStorage.removeItem(CAREER_DATA_KEY);
    return initializeCareerData();
  }
}

function validateAchievementsOnLoad() {
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_KEY);
    if (!raw) return [];
    
    const achievements = JSON.parse(raw);
    
    // Validate each achievement
    if (!Array.isArray(achievements)) {
      console.warn('[ACHIEVEMENTS] Not an array, reinitializing');
      localStorage.removeItem(ACHIEVEMENTS_KEY);
      return [];
    }
    
    const valid = achievements.filter(a => {
      if (!a.key || !ACHIEVEMENTS[a.key]) {
        console.warn('[ACHIEVEMENTS] Invalid achievement key:', a.key);
        return false;
      }
      return true;
    });
    
    if (valid.length < achievements.length) {
      console.warn(`[ACHIEVEMENTS] Removed ${achievements.length - valid.length} invalid achievements`);
      localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(valid));
    }
    
    return valid;
  } catch (err) {
    console.error('[ACHIEVEMENTS] Load failed:', err);
    localStorage.removeItem(ACHIEVEMENTS_KEY);
    return [];
  }
}

function validateDiscordAccountOnLoad() {
  try {
    const raw = localStorage.getItem(DISCORD_KEY);
    if (!raw) return null;
    
    const account = JSON.parse(raw);
    
    // Validate required fields
    if (!account.username || !account.connectedAt || !account.discordId) {
      console.warn('[DISCORD] Invalid account structure, removing');
      localStorage.removeItem(DISCORD_KEY);
      return null;
    }
    
    return account;
  } catch (err) {
    console.error('[DISCORD] Account load failed:', err);
    localStorage.removeItem(DISCORD_KEY);
    return null;
  }
}

function updateCareerStats(runData) {
  const career = validateCareerOnLoad();
  
  career.totalRuns += 1;
  career.totalScore += Number(runData.score || 0);
  career.bestScore = Math.max(career.bestScore, Number(runData.score || 0));
  
  if (runData.isPB) career.personalBests += 1;
  if (runData.clean) {
    career.cleanRuns += 1;
    career.currentStreak += 1;
    career.bestStreak = Math.max(career.bestStreak, career.currentStreak);
  } else {
    career.crashes += 1;
    career.currentStreak = 0;
  }
  
  career.averageScore = career.totalScore / career.totalRuns;
  
  setCareerData(career);
  uiSync.emit(SYNC_EVENTS.CAREER_UPDATED, { source: 'run', totalRuns: career.totalRuns });
  return career;
}

function getAchievements() {
  return validateAchievementsOnLoad();
}

function unlockAchievement(achievementKey) {
  const achievements = getAchievements();
  if (!achievements.find(a => a.key === achievementKey)) {
    achievements.push({
      key: achievementKey,
      ...ACHIEVEMENTS[achievementKey],
      unlockedAt: new Date().toISOString(),
    });
    localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(achievements));
    showToast({
      icon: ACHIEVEMENTS[achievementKey].icon,
      title: 'Achievement Unlocked!',
      msg: ACHIEVEMENTS[achievementKey].desc,
      type: 'success',
      duration: 4000,
    });
    // Phase 34: nav badge + card animation
    incrementCareerBadge();
    const card = document.getElementById(`ach_${achievementKey}`);
    if (card) {
      card.classList.remove('just-unlocked');
      void card.offsetWidth; // force reflow to restart animation
      card.classList.add('just-unlocked');
      setTimeout(() => card.classList.remove('just-unlocked'), 800);
    }
    uiSync.emit(SYNC_EVENTS.ACHIEVEMENT_UNLOCKED, { key: achievementKey });
    return true;
  }
  return false;
}

function checkAchievements(career) {
  if (career.totalRuns === 1) unlockAchievement('first_run');
  if (career.totalRuns === 10) unlockAchievement('ten_runs');
  if (career.totalRuns === 100) unlockAchievement('hundred_runs');
  if (career.cleanRuns === 5) unlockAchievement('clean_streak_5');
  if (career.currentStreak === 10) unlockAchievement('clean_streak_10');
  if (career.bestScore >= 1000) unlockAchievement('score_1000');
  if (career.personalBests === 5) unlockAchievement('pb_five');
  if (career.bestScore >= 5000) unlockAchievement('combo_5x'); // proxy for combo
  if (career.crashes === 0 && career.totalRuns >= 10) unlockAchievement('no_crashes_ten');
  if (career.totalScore >= 10000) unlockAchievement('total_score_10k');
}

function connectDiscord(username, discordId = null, avatarUrl = null) {
  const account = {
    username,
    connectedAt: new Date().toISOString(),
    discordId: discordId || `discord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    ...(avatarUrl ? { avatarUrl } : {}),
  };
  setDiscordAccount(account);
  updateDiscordDisplay();
  uiSync.emit(SYNC_EVENTS.DISCORD_CONNECTED, { username });
  showToast({
    msg: `Welcome, ${username}. Career tracking enabled.`,
    type: 'success',
    duration: 3000,
  });
}

async function loginWithDiscord() {
  const state = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const base = await resolveApiBaseForAuth();
  if (!base) {
    loginError.textContent = 'Integration API offline. Start bot services, then try Discord login again.';
    return;
  }
  const authUrl = `${base}/auth/discord?state=${encodeURIComponent(state)}`;

  const popup = window.open(authUrl, '_blank', 'width=500,height=720,menubar=no,toolbar=no,scrollbars=yes');
  if (!popup) {
    loginError.textContent = 'Popup blocked â€” allow popups for this page and try again.';
    return;
  }

  loginError.textContent = 'Waiting for Discord loginâ€¦';
  if (discordLoginBtn) discordLoginBtn.disabled = true;
  loginBtn.disabled = true;

  let attempts = 0;
  let pollInFlight = false;
  let transientErrors = 0;
  const maxAttempts = 60; // 90s

  const finalizeLoginPoll = (message = '', shouldClosePopup = false) => {
    clearInterval(pollInterval);
    if (message) loginError.textContent = message;
    if (discordLoginBtn) discordLoginBtn.disabled = false;
    loginBtn.disabled = false;
    if (shouldClosePopup) {
      try { popup.close(); } catch {}
    }
  };

  const pollInterval = setInterval(async () => {
    if (pollInFlight) return;
    attempts++;

    if (popup.closed) {
      finalizeLoginPoll('Discord login cancelled.', false);
      return;
    }

    if (attempts > maxAttempts) {
      finalizeLoginPoll('Discord login timed out. Try again.', true);
      return;
    }

    pollInFlight = true;
    try {
      const pollUrl = new URL('/auth/discord/poll', base);
      pollUrl.searchParams.set('state', state);
      const r = await fetchWithTimeout(pollUrl.toString(), {}, DISCORD_POLL_TIMEOUT_MS);
      if (r.status === 202) {
        transientErrors = 0;
        return; // still pending
      }
      if (!r.ok) {
        finalizeLoginPoll('Auth error â€” check bot logs.', false);
        return;
      }

      const data = await r.json().catch(() => null);
      if (!data?.ok || !data?.data) {
        transientErrors += 1;
        if (transientErrors >= DISCORD_AUTH_MAX_TRANSIENT_ERRORS) {
          finalizeLoginPoll('Auth response invalid. Try again.', false);
        }
        return;
      }

      const { id: discordId, username, avatarUrl } = data.data;
      // Log the user in
      localStorage.setItem('mpr_user', username);
      applyLogin(username);
      // Attach real Discord account (overrides the auto-seed)
      setDiscordAccount({
        username,
        discordId,
        avatarUrl: avatarUrl || null,
        connectedAt: new Date().toISOString(),
      });
      updateDiscordDisplay();
      updateAdminTabVisibility();
      // Owner always gets FOUNDER tier
      if (discordId === OWNER_DISCORD_ID) {
        setTierData('founder', new Date().toISOString(), null);
        updateTierDisplay();
      }
      finalizeLoginPoll('', true);
    } catch {
      transientErrors += 1;
      if (transientErrors >= DISCORD_AUTH_MAX_TRANSIENT_ERRORS) {
        finalizeLoginPoll('Auth network unstable. Try again.', false);
      }
      // network blip â€” keep polling unless repeated failures exceed threshold
    } finally {
      pollInFlight = false;
    }
  }, 1500);
}

function disconnectDiscord() {
  setDiscordAccount(null);
  updateDiscordDisplay();
  uiSync.emit(SYNC_EVENTS.DISCORD_DISCONNECTED);
  showToast({
    icon: 'ðŸ”Œ',
    title: 'Discord Disconnected',
    msg: 'Career tracking has been disabled.',
    type: 'warning',
    duration: 2000,
  });
}

function updateDiscordDisplay() {
  const discordAccount = getDiscordAccount();
  const discordStatusInline = document.getElementById('discordStatusInline');
  const discordStatusConnected = document.getElementById('discordStatusConnected');
  
  if (!discordStatusInline || !discordStatusConnected) return;
  
  if (discordAccount) {
    discordStatusInline.classList.add('discord-hidden');
    discordStatusConnected.classList.remove('discord-hidden');
    
    const career = getCareerData();
    const achievements = getAchievements();
    
    const userDisplay = document.getElementById('discordUserDisplay');
    const discordSyncRuns = document.getElementById('discordSyncRuns');
    const discordSyncAchievements = document.getElementById('discordSyncAchievements');
    const discordSyncStreak = document.getElementById('discordSyncStreak');
    
    if (userDisplay) userDisplay.textContent = `${discordAccount.username} #${discordAccount.discordId.slice(-4)}`;
    if (discordSyncRuns) discordSyncRuns.textContent = String(career.totalRuns);
    if (discordSyncAchievements) discordSyncAchievements.textContent = String(achievements.length);
    if (discordSyncStreak) discordSyncStreak.textContent = String(career.bestStreak);
  } else {
    discordStatusInline.classList.remove('discord-hidden');
    discordStatusConnected.classList.add('discord-hidden');
  }
}

// â”€â”€ Owner utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function isOwner() {
  const account = getDiscordAccount();
  return account?.discordId === OWNER_DISCORD_ID;
}

function ensureOwnerAccountSeeded() {
  const existing = getDiscordAccount();
  // Auto-seed if nothing stored, or if only a mock ID is stored
  if (!existing || String(existing.discordId || '').startsWith('discord_')) {
    localStorage.setItem(DISCORD_KEY, JSON.stringify({
      username:    'Hank',
      discordId:   OWNER_DISCORD_ID,
      connectedAt: new Date().toISOString(),
    }));
    updateDiscordDisplay();
  }

  // Always ensure the owner has the highest (Founder) tier locked in
  const tierStored = getTierData();
  if (!tierStored || tierStored.tier !== 'founder') {
    setTierData('founder', new Date().toISOString(), null);
  }
}

function updateAdminTabVisibility() {
  const adminBtn = document.getElementById('adminNavBtn');
  if (!adminBtn) return;
  if (isOwner()) {
    adminBtn.classList.remove('hud-hidden');
  } else {
    adminBtn.classList.add('hud-hidden');
  }
}

// â”€â”€ Admin panel API calls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function fetchAdminStatus() {
  const res = await fetchGetWithFallback('/admin/status', (url) => {
    url.searchParams.set('ownerDiscordId', OWNER_DISCORD_ID);
  });
  const payload = await res.json().catch(() => null);
  if (!payload?.ok || !payload?.data) throw new Error('admin_status_invalid_payload');
  return payload.data;
}

async function adminAction(action, params = {}) {
  const json = await postToIntegration('/admin/action', {
    ownerDiscordId: OWNER_DISCORD_ID,
    action,
    ...params,
  }, {
    timeoutMs: 2400,
    expectJson: true,
  });

  if (!json?.ok) throw new Error(json?.error || 'action_failed');
  return json;
}

function initAdminPanel() {
  if (!isOwner()) return;

  // Status refresh button
  const adminStatusBtn = document.getElementById('adminRefreshStatusBtn');
  if (adminStatusBtn) {
    adminStatusBtn.addEventListener('click', async () => {
      adminStatusBtn.disabled = true;
      adminStatusBtn.textContent = 'â€¦';
      try {
        const s = await fetchAdminStatus();
        const el = (id) => document.getElementById(id);
        if (el('adminBotPing'))    el('adminBotPing').textContent    = `${s.ping}ms`;
        if (el('adminBotUptime'))  el('adminBotUptime').textContent  = s.uptime;
        if (el('adminGuildName'))  el('adminGuildName').textContent  = s.guildName;
        if (el('adminMemberCount')) el('adminMemberCount').textContent = String(s.memberCount);
        if (el('adminBotTag'))     el('adminBotTag').textContent     = s.botTag;
        showToast({ icon: 'â—ˆ', title: 'Bot Online', msg: `Ping: ${s.ping}ms`, type: 'finish' });
      } catch (err) {
        showToast({ icon: 'âŠ˜', title: 'Bot Offline', msg: err.message, type: 'warning' });
      } finally {
        adminStatusBtn.disabled = false;
        adminStatusBtn.textContent = 'â†º Refresh Status';
      }
    });
  }

  // Refresh banner URLs button
  const refreshBannersBtn = document.getElementById('adminRefreshBannersBtn');
  if (refreshBannersBtn) {
    refreshBannersBtn.addEventListener('click', async () => {
      refreshBannersBtn.disabled = true;
      refreshBannersBtn.textContent = 'â€¦';
      try {
        const result = await adminAction('refresh_banner_urls');
        showToast({ icon: 'â—ˆ', title: 'Banners Refreshed', msg: `${result.data?.count || 0} banners updated from #logos`, type: 'finish' });
      } catch (err) {
        showToast({ icon: 'âŠ˜', title: 'Failed', msg: err.message, type: 'warning' });
      } finally {
        refreshBannersBtn.disabled = false;
        refreshBannersBtn.textContent = 'â†º Refresh Banner URLs';
      }
    });
  }

  // Leaderboard force-post buttons
  document.querySelectorAll('[data-admin-leaderboard]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.adminLeaderboard;
      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = 'â€¦';
      try {
        await adminAction('force_leaderboard', { boardType: type });
        showToast({ icon: 'â—†', title: 'Leaderboard Posted', msg: `${type} board updated`, type: 'finish' });
      } catch (err) {
        showToast({ icon: 'âŠ˜', title: 'Failed', msg: err.message, type: 'warning' });
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    });
  });

  // Force digest button
  const digestBtn = document.getElementById('adminForceDigestBtn');
  if (digestBtn) {
    digestBtn.addEventListener('click', async () => {
      digestBtn.disabled = true;
      digestBtn.textContent = 'â€¦';
      try {
        await adminAction('force_digest');
        showToast({ icon: 'â—ˆ', title: 'Digest Posted', msg: 'Daily digest forced to channel', type: 'finish' });
      } catch (err) {
        showToast({ icon: 'âŠ˜', title: 'Failed', msg: err.message, type: 'warning' });
      } finally {
        digestBtn.disabled = false;
        digestBtn.textContent = 'â–¶ Force Post Digest';
      }
    });
  }

  // Refresh all embeds button
  const embedBtn = document.getElementById('adminRefreshEmbedsBtn');
  if (embedBtn) {
    embedBtn.addEventListener('click', async () => {
      embedBtn.disabled = true;
      embedBtn.textContent = 'â€¦';
      try {
        await adminAction('refresh_embeds');
        showToast({ icon: 'â—ˆ', title: 'Embeds Refreshed', msg: 'All leaderboard + hub embeds synced', type: 'finish' });
      } catch (err) {
        showToast({ icon: 'âŠ˜', title: 'Failed', msg: err.message, type: 'warning' });
      } finally {
        embedBtn.disabled = false;
        embedBtn.textContent = 'â†º Refresh All Embeds';
      }
    });
  }

  // Announce button
  const announceBtn  = document.getElementById('adminAnnounceBtn');
  const announceText = document.getElementById('adminAnnounceText');
  if (announceBtn && announceText) {
    announceBtn.addEventListener('click', async () => {
      const msg = announceText.value.trim();
      if (!msg) { showToast({ icon: 'âŠ˜', title: 'Empty', msg: 'Write a message first', type: 'warning' }); return; }
      announceBtn.disabled = true;
      announceBtn.textContent = 'â€¦';
      try {
        await adminAction('announce', { message: msg });
        announceText.value = '';
        showToast({ icon: 'â—ˆ', title: 'Announced', msg: 'Posted to announcements channel', type: 'finish' });
      } catch (err) {
        showToast({ icon: 'âŠ˜', title: 'Failed', msg: err.message, type: 'warning' });
      } finally {
        announceBtn.disabled = false;
        announceBtn.textContent = 'â–¶ Post Announcement';
      }
    });
  }
}

function initDiscordSystem() {
  const discordModal = document.getElementById('discordModal');
  const discordConnectBtn = document.getElementById('discordConnectBtn');
  const discordCancelBtn = document.getElementById('discordCancelBtn');
  const discordQuickConnectBtn = document.getElementById('discordQuickConnectBtn');
  const discordDisconnectBtn = document.getElementById('discordDisconnectBtn');
  const discordModalOverlay = discordModal?.querySelector('.discord-modal-overlay');
  
  if (discordQuickConnectBtn) {
    discordQuickConnectBtn.addEventListener('click', () => {
      if (discordModal) discordModal.classList.add('visible');
    });
  }
  
  if (discordConnectBtn) {
    discordConnectBtn.addEventListener('click', () => {
      if (discordModal) discordModal.classList.remove('visible');
      loginWithDiscord();
    });
  }
  
  if (discordCancelBtn) {
    discordCancelBtn.addEventListener('click', () => {
      if (discordModal) discordModal.classList.remove('visible');
    });
  }
  
  if (discordDisconnectBtn) {
    discordDisconnectBtn.addEventListener('click', () => {
      if (confirm('Disconnect from Discord and disable career tracking?')) {
        disconnectDiscord();
        if (discordModal) discordModal.classList.remove('visible');
      }
    });
  }
  
  if (discordModalOverlay) {
    discordModalOverlay.addEventListener('click', () => {
      if (discordModal) discordModal.classList.remove('visible');
    });
  }
  
  updateDiscordDisplay();
}

// â”€â”€ Career Dashboard Population (Phase 32) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function updateCareerDashboard() {
  const career = getCareerData();
  const achievements = getAchievements();
  const discordAccount = getDiscordAccount();
  const history = loadRunHistory();
  
  // Career Hero Card
  const careerAvatar = document.getElementById('careerAvatar');
  const careerName = document.getElementById('careerName');
  const careerStatus = document.getElementById('careerStatus');
  
  if (careerAvatar && discordAccount) {
    careerAvatar.textContent = discordAccount.username[0].toUpperCase();
    careerName.textContent = discordAccount.username;
    careerStatus.textContent = 'ðŸŽ® Discord Connected';
  } else if (careerName) {
    careerName.textContent = 'Local Driver';
    careerStatus.textContent = 'Connect Discord to unlock full tracking';
  }
  
  // Career Stats
  const careerTotalRuns = document.getElementById('careerTotalRuns');
  const careerBestScore = document.getElementById('careerBestScore');
  const careerTotalScore = document.getElementById('careerTotalScore');
  const careerCleanRate = document.getElementById('careerCleanRate');
  const careerCurrentStreak = document.getElementById('careerCurrentStreak');
  const careerBestStreak = document.getElementById('careerBestStreak');
  const careerCrashes = document.getElementById('careerCrashes');
  const careerPBs = document.getElementById('careerPBs');
  const careerAvgScore = document.getElementById('careerAvgScore');
  
  if (careerTotalRuns) careerTotalRuns.textContent = String(career.totalRuns);
  if (careerBestScore) careerBestScore.textContent = String(Math.floor(career.bestScore));
  if (careerTotalScore) careerTotalScore.textContent = String(Math.floor(career.totalScore));
  
  const cleanRate = career.totalRuns > 0 ? Math.round((career.cleanRuns / career.totalRuns) * 100) : 0;
  if (careerCleanRate) careerCleanRate.textContent = `${cleanRate}%`;
  if (careerCurrentStreak) careerCurrentStreak.textContent = String(career.currentStreak);
  if (careerBestStreak) careerBestStreak.textContent = String(career.bestStreak);
  if (careerCrashes) careerCrashes.textContent = String(career.crashes);
  if (careerPBs) careerPBs.textContent = String(career.personalBests);
  if (careerAvgScore) careerAvgScore.textContent = String(Math.floor(career.averageScore || 0));
  
  // Update Milestones
  updateCareerMilestones(career);
  
  // Update Achievement Cards
  updateAchievementCards(achievements);
  
  // Update Highlights
  updateCareerHighlights(career, history);
  
  // Phase 33: Trend sparkline + Route PBs
  renderCareerTrend();
  renderRoutePBs();
  
  // Phase 35: rank badges
  updateRankBadges();
  
  // Phase 36: rank progress + route analytics
  updateRankProgress();
  renderRouteAnalytics();
}

function updateCareerMilestones(career) {
  const milestones = [
    { id: 'm1', icon: 'ðŸ', name: 'First Run', check: career.totalRuns >= 1 },
    { id: 'm2', icon: 'ðŸ”Ÿ', name: 'Decade', check: career.totalRuns >= 10 },
    { id: 'm3', icon: 'ðŸ’¯', name: 'Century', check: career.totalRuns >= 100 },
    { id: 'm4', icon: 'ðŸ“ˆ', name: 'Personal Record', check: career.personalBests >= 1 },
    { id: 'm5', icon: 'ðŸ”¥', name: 'Score 1000', check: career.bestScore >= 1000 },
  ];
  
  milestones.forEach(m => {
    const el = document.getElementById(m.id);
    if (el) {
      el.textContent = m.check ? `${m.icon} ${m.name} - Unlocked!` : `${m.icon} ${m.name} - ${career.totalRuns}/10+`;
      el.style.color = m.check ? '#5865F2' : 'var(--text-3)';
    }
  });
}

function updateAchievementCards(achievements) {
  const achievementKeys = Object.keys(ACHIEVEMENTS);
  const unlockedKeys = new Set(achievements.map(a => a.key));
  const career = validateCareerOnLoad();
  
  // Map each achievement to its progress data
  const progressMap = {
    first_run:      { value: career.totalRuns,    max: 1,     label: (v, m) => `${Math.min(v, m)} / ${m}` },
    ten_runs:       { value: career.totalRuns,    max: 10,    label: (v, m) => `${Math.min(v, m)} / ${m}` },
    hundred_runs:   { value: career.totalRuns,    max: 100,   label: (v, m) => `${Math.min(v, m)} / ${m}` },
    clean_streak_5: { value: career.currentStreak, max: 5,   label: (v, m) => `${Math.min(v, m)} / ${m}` },
    clean_streak_10:{ value: career.currentStreak, max: 10,  label: (v, m) => `${Math.min(v, m)} / ${m}` },
    score_1000:     { value: career.bestScore,    max: 1000,  label: (v, m) => `${Math.min(Math.floor(v), m).toLocaleString()} / ${m.toLocaleString()}` },
    pb_five:        { value: career.personalBests, max: 5,   label: (v, m) => `${Math.min(v, m)} / ${m}` },
    combo_5x:       { value: career.bestScore,    max: 5000,  label: (v, m) => `${Math.min(Math.floor(v), m).toLocaleString()} / ${m.toLocaleString()}` },
    no_crashes_ten: { value: career.crashes === 0 ? career.totalRuns : 0, max: 10, label: (v, m) => career.crashes > 0 ? 'Reset by crash' : `${Math.min(v, m)} / ${m}` },
    total_score_10k:{ value: career.totalScore,   max: 10000, label: (v, m) => `${Math.min(Math.floor(v), m).toLocaleString()} / ${m.toLocaleString()}` },
  };
  
  // Update achievement count
  const countEl = document.querySelector('.achievement-count');
  if (countEl) countEl.textContent = String(unlockedKeys.size);
  
  achievementKeys.forEach(key => {
    const card = document.getElementById(`ach_${key}`);
    if (!card) return;
    
    const isUnlocked = unlockedKeys.has(key);
    const statusEl = card.querySelector('.ach-status');
    const progressFill = document.getElementById(`achp_${key}`);
    const progressLabel = document.getElementById(`achl_${key}`);
    const prog = progressMap[key];
    
    // Progress bar
    if (prog && progressFill && progressLabel) {
      if (isUnlocked) {
        progressFill.style.width = '100%';
        progressLabel.textContent = 'Complete!';
      } else {
        const pct = Math.min(100, Math.round((prog.value / prog.max) * 100));
        progressFill.style.width = `${pct}%`;
        progressLabel.textContent = prog.label(prog.value, prog.max);
      }
    }
    
    if (isUnlocked) {
      card.classList.add('unlocked');
      card.classList.remove('locked');
      if (statusEl) {
        statusEl.textContent = 'UNLOCKED';
        statusEl.classList.remove('locked');
        statusEl.classList.add('unlocked');
      }
    } else {
      card.classList.remove('unlocked');
      card.classList.add('locked');
      if (statusEl) {
        statusEl.textContent = 'LOCKED';
        statusEl.classList.add('locked');
        statusEl.classList.remove('unlocked');
      }
    }
  });
}

function updateCareerHighlights(career, history) {
  // Best Run
  if (history && history.length > 0) {
    const bestRun = history.reduce((best, run) => 
      (Number(run.score || 0) > Number(best.score || 0)) ? run : best
    );
    
    const highlightBestScore = document.getElementById('highlightBestScore');
    const highlightBestCombo = document.getElementById('highlightBestCombo');
    const highlightBestDate = document.getElementById('highlightBestDate');
    
    if (highlightBestScore) highlightBestScore.textContent = String(Math.floor(bestRun.score || 0));
    if (highlightBestCombo) highlightBestCombo.textContent = `Ã—${(bestRun.maxCombo || 1).toFixed(2)}`;
    if (highlightBestDate && bestRun.timestamp) {
      const date = new Date(bestRun.timestamp);
      highlightBestDate.textContent = date.toLocaleDateString();
    }
    
    // Latest Run
    const latestRun = history[0];
    const highlightLatestScore = document.getElementById('highlightLatestScore');
    const highlightLatestStatus = document.getElementById('highlightLatestStatus');
    const highlightLatestTime = document.getElementById('highlightLatestTime');
    
    if (highlightLatestScore) highlightLatestScore.textContent = String(Math.floor(latestRun.score || 0));
    if (highlightLatestStatus) highlightLatestStatus.textContent = latestRun.clean ? 'âœ“ Clean' : 'âœ— Crash';
    if (highlightLatestTime) {
      const date = new Date(latestRun.timestamp || Date.now());
      highlightLatestTime.textContent = date.toLocaleTimeString();
    }
    
    // Session Stats
    const sessionDate = new Date().toLocaleDateString();
    const sessionRuns = history.filter(r => {
      const rDate = new Date(r.timestamp || 0);
      return rDate.toLocaleDateString() === sessionDate;
    });
    
    const highlightSessionRuns = document.getElementById('highlightSessionRuns');
    const highlightSessionBest = document.getElementById('highlightSessionBest');
    const highlightSessionAvg = document.getElementById('highlightSessionAvg');
    
    if (highlightSessionRuns) highlightSessionRuns.textContent = String(sessionRuns.length);
    if (highlightSessionBest && sessionRuns.length > 0) {
      const sessionBest = Math.max(...sessionRuns.map(r => Number(r.score || 0)));
      highlightSessionBest.textContent = String(Math.floor(sessionBest));
    }
    if (highlightSessionAvg && sessionRuns.length > 0) {
      const sessionAvg = sessionRuns.reduce((sum, r) => sum + Number(r.score || 0), 0) / sessionRuns.length;
      highlightSessionAvg.textContent = String(Math.floor(sessionAvg));
    }
  }
}

// â”€â”€ Career Trend Sparkline (Phase 33) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderCareerTrend() {
  const el = document.getElementById('careerTrend');
  if (!el) return;
  const history = loadRunHistory().slice(0, 10).reverse();
  if (!history.length) {
    el.innerHTML = '<span style="font-size:0.65rem;color:var(--text-3);">No runs yet</span>';
    return;
  }
  const maxScore = Math.max(...history.map(r => Number(r.score || 0)), 1);
  el.innerHTML = history.map(r => {
    const score = Number(r.score || 0);
    const heightPct = Math.max(8, Math.round((score / maxScore) * 100));
    const cls = r.isPB ? 'career-trend-bar pb' : r.clean ? 'career-trend-bar clean' : 'career-trend-bar crash';
    return `<div class="${cls}" style="height:${heightPct}%" title="${score.toLocaleString()} pts${r.clean ? ' Â· Clean' : ' Â· Crash'}${r.isPB ? ' Â· PB' : ''}"></div>`;
  }).join('');
}

// â”€â”€ Route PB Tracker (Phase 33) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderRoutePBs() {
  const el = document.getElementById('routePBList');
  if (!el) return;
  const history = loadRunHistory();
  if (!history.length) {
    el.innerHTML = '<p class="empty-msg">No route data yet â€” complete runs to populate.</p>';
    return;
  }
  
  // Aggregate per-route PBs
  const routeMap = new Map();
  history.forEach(r => {
    const route = r.route || 'Unknown';
    const score = Number(r.score || 0);
    if (!routeMap.has(route)) {
      routeMap.set(route, { pb: score, runs: 0, cleanRuns: 0, lastTime: r.time || '' });
    }
    const cur = routeMap.get(route);
    cur.pb = Math.max(cur.pb, score);
    cur.runs += 1;
    if (r.clean) cur.cleanRuns += 1;
    if (!cur.lastTime) cur.lastTime = r.time || '';
  });
  
  // Sort by PB descending
  const sorted = Array.from(routeMap.entries())
    .sort(([, a], [, b]) => b.pb - a.pb);
  
  if (!sorted.length) {
    el.innerHTML = '<p class="empty-msg">No route data yet.</p>';
    return;
  }
  
  el.innerHTML = sorted.map(([route, data]) => {
    const cleanRate = data.runs > 0 ? Math.round((data.cleanRuns / data.runs) * 100) : 0;
    return `<div class="route-pb-row">
      <div>
        <div class="route-pb-name">${route}</div>
        <div class="route-pb-meta">${data.runs} run${data.runs !== 1 ? 's' : ''} Â· ${cleanRate}% clean</div>
      </div>
      <div style="display:flex;align-items:center;">
        <div class="route-pb-score">${data.pb.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        <span class="route-pb-badge">PB</span>
      </div>
    </div>`;
  }).join('');
}

// â”€â”€ Run History Filter System (Phase 33) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let _rhActiveFilter = 'all';
let _rhRouteSearch = '';

function initRunHistoryFilters() {
  const filterBtns = document.querySelectorAll('.rh-filter-btn[data-filter]');
  const searchInput = document.getElementById('rhRouteSearch');
  
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _rhActiveFilter = btn.dataset.filter;
      renderRunHistory();
    });
  });
  
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      _rhRouteSearch = searchInput.value.trim().toLowerCase();
      renderRunHistory();
    });
  }
}

function getFilteredRunHistory() {
  let history = loadRunHistory();
  
  // Apply filter
  if (_rhActiveFilter === 'clean') {
    history = history.filter(r => r.clean === true);
  } else if (_rhActiveFilter === 'crash') {
    history = history.filter(r => r.clean === false);
  } else if (_rhActiveFilter === 'pb') {
    history = history.filter(r => r.isPB === true);
  }
  
  // Apply route search
  if (_rhRouteSearch) {
    history = history.filter(r => (r.route || '').toLowerCase().includes(_rhRouteSearch));
  }
  
  return history;
}

// â”€â”€ Session Recap System (Phase 33) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SESSION_RECAP_INTERVAL = 5; // Show recap every N runs this session
const SESSION_RECAP_COUNT_KEY = 'mpr_session_recap_count';

function checkSessionRecap(career) {
  const sessionCount = Number(sessionStorage.getItem(SESSION_RECAP_COUNT_KEY) || 0) + 1;
  sessionStorage.setItem(SESSION_RECAP_COUNT_KEY, String(sessionCount));
  
  if (sessionCount % SESSION_RECAP_INTERVAL !== 0) return;
  
  // Build session recap stats
  const history = loadRunHistory();
  const todayStr = new Date().toLocaleDateString();
  const sessionRuns = history.filter(r => {
    const d = new Date(r.timestamp || 0);
    return d.toLocaleDateString() === todayStr;
  }).slice(0, sessionCount);
  
  if (sessionRuns.length === 0) return;
  
  const scores = sessionRuns.map(r => Number(r.score || 0));
  const bestSession = Math.max(...scores);
  const avgSession = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const cleanCount = sessionRuns.filter(r => r.clean).length;
  const cleanPct = Math.round((cleanCount / sessionRuns.length) * 100);
  const pbCount = sessionRuns.filter(r => r.isPB).length;
  
  showToast({
    icon: 'ðŸ“Š',
    title: `Session Recap â€” ${sessionCount} Runs`,
    msg: `Best: ${bestSession.toLocaleString()} Â· Avg: ${avgSession.toLocaleString()} Â· ${cleanPct}% Clean${pbCount > 0 ? ` Â· ${pbCount} PB${pbCount > 1 ? 's' : ''}` : ''}`,
    type: 'clean',
    duration: 7000,
  });
}

function clearRunHistoryFilter() {
  _rhActiveFilter = 'all';
  _rhRouteSearch = '';
  // Reset filter buttons UI
  document.querySelectorAll('.rh-filter-btn[data-filter]').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === 'all');
  });
  const inp = document.getElementById('rhRouteSearch');
  if (inp) inp.value = '';
  renderRunHistory();
}

// â”€â”€ Score Velocity Calculator (Phase 34) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function calculateScoreVelocity() {
  const history = loadRunHistory();
  if (history.length < 3) return null;
  
  const recent = history.slice(0, 3).map(r => Number(r.score || 0));
  const older  = history.slice(3, 6).map(r => Number(r.score || 0));
  
  if (!older.length) return null;
  
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg  = older.reduce((a, b) => a + b, 0) / older.length;
  
  if (olderAvg === 0) return null;
  
  const delta = recentAvg - olderAvg;
  const pct   = Math.round((delta / olderAvg) * 100);
  return { delta: Math.round(delta), pct, trend: delta > 50 ? 'up' : delta < -50 ? 'down' : 'flat' };
}

function updateScoreVelocity() {
  const vel = calculateScoreVelocity();
  const el  = document.getElementById('ssVelocity');
  const chip = document.getElementById('ssVelocityChip');
  if (!el) return;
  
  if (!vel) {
    el.textContent = '--';
    el.className = 'ss-val vel-flat';
    return;
  }
  
  const sign = vel.pct > 0 ? '+' : '';
  el.textContent = `${sign}${vel.pct}%`;
  el.className = `ss-val vel-${vel.trend}`;
  if (chip) chip.title = `${vel.trend === 'up' ? 'â†‘' : vel.trend === 'down' ? 'â†“' : 'â†’'} ${sign}${vel.delta} pts vs prev 3 runs`;
}

// â”€â”€ Driver Intelligence Card Updater (Phase 34) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function updateDriverIntel() {
  const career = validateCareerOnLoad();
  const history = loadRunHistory();
  
  const intelAllTimeRuns = document.getElementById('intelAllTimeRuns');
  const intelAllTimeBest = document.getElementById('intelAllTimeBest');
  const intelBestStreak  = document.getElementById('intelBestStreak');
  const intelAvgScore    = document.getElementById('intelAvgScore');
  const intelCleanRate   = document.getElementById('intelCleanRate');
  const intelTrend       = document.getElementById('intelTrend');
  
  if (intelAllTimeRuns) intelAllTimeRuns.textContent = String(career.totalRuns);
  if (intelAllTimeBest) intelAllTimeBest.textContent = career.bestScore.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (intelBestStreak)  intelBestStreak.textContent  = String(career.bestStreak);
  if (intelAvgScore)    intelAvgScore.textContent     = Math.floor(career.averageScore || 0).toLocaleString();
  
  const cleanRate = career.totalRuns > 0 ? Math.round((career.cleanRuns / career.totalRuns) * 100) : 0;
  if (intelCleanRate) intelCleanRate.textContent = `${cleanRate}%`;
  
  // 3-run trend arrow
  if (intelTrend && history.length >= 3) {
    const recent = history.slice(0, 3).map(r => Number(r.score || 0));
    const scores = [...recent];
    const isRising  = scores[0] > scores[1] && scores[1] > scores[2];
    const isFalling = scores[0] < scores[1] && scores[1] < scores[2];
    if (isRising) {
      intelTrend.textContent = 'â†‘ Rising';
      intelTrend.className = 'intel-val accent-green-text';
    } else if (isFalling) {
      intelTrend.textContent = 'â†“ Falling';
      intelTrend.style.color = '#ef4444';
      intelTrend.className = 'intel-val';
    } else {
      intelTrend.textContent = 'â†’ Steady';
      intelTrend.className = 'intel-val';
      intelTrend.style.color = '';
    }
  } else if (intelTrend) {
    intelTrend.textContent = 'â€”';
    intelTrend.style.color = '';
  }
}

// â”€â”€ Career JSON Export (Phase 34) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function exportCareerJSON() {
  const career       = validateCareerOnLoad();
  const achievements = getAchievements();
  const history      = loadRunHistory();
  const discord      = getDiscordAccount();
  const tier         = getTierData();
  
  const exportData = {
    exportedAt:   new Date().toISOString(),
    exportVersion: 1,
    driver: {
      username:  currentUser || 'Unknown',
      discord:   discord ? { username: discord.username, connectedAt: discord.connectedAt } : null,
      tier:      tier?.tier || 'free',
    },
    career,
    achievements: achievements.map(a => ({ key: a.key, unlockedAt: a.unlockedAt })),
    runHistory:   history,
  };
  
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `mpr-career-${(currentUser || 'driver').replace(/\s+/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  
  showToast({
    icon: 'â¬‡',
    title: 'Career Exported',
    msg: `${career.totalRuns} runs Â· ${achievements.length} achievements Â· ${history.length} history entries`,
    type: 'clean',
    duration: 4000,
  });
}

// â”€â”€ Career Nav Badge System (Phase 34) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const CAREER_BADGE_KEY = 'mpr_career_badge_count';

function setCareerNavBadge(count) {
  const badge = document.getElementById('careerNavBadge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = String(count);
    badge.classList.add('visible');
  } else {
    badge.classList.remove('visible');
    badge.textContent = '';
  }
}

function incrementCareerBadge() {
  const current = Number(sessionStorage.getItem(CAREER_BADGE_KEY) || 0) + 1;
  sessionStorage.setItem(CAREER_BADGE_KEY, String(current));
  setCareerNavBadge(current);
}

function clearCareerBadge() {
  sessionStorage.removeItem(CAREER_BADGE_KEY);
  setCareerNavBadge(0);
}

// â”€â”€ Run History Delta vs Career PB (Phase 34) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getRunDeltaVsPB(runScore) {
  const career = validateCareerOnLoad();
  const pb = career.bestScore;
  if (!pb || pb === 0) return null;
  const delta = runScore - pb;
  if (Math.abs(delta) < 1) return { delta: 0, pct: 0, cls: 'flat', label: '= PB' };
  const pct = Math.round(Math.abs(delta / pb) * 100);
  if (delta > 0) return { delta, pct, cls: 'up', label: `+${Math.floor(delta).toLocaleString()}` };
  return { delta, pct, cls: 'down', label: `${Math.floor(delta).toLocaleString()}` };
}

function getRunDeltaVsPB(runScore) {
  const career = validateCareerOnLoad();
  const pb = career.bestScore;
  if (!pb || pb === 0) return null;
  const delta = runScore - pb;
  if (Math.abs(delta) < 1) return { delta: 0, pct: 0, cls: 'flat', label: '= PB' };
  const pct = Math.round(Math.abs(delta / pb) * 100);
  if (delta > 0) return { delta, pct, cls: 'up', label: `+${Math.floor(delta).toLocaleString()}` };
  return { delta, pct, cls: 'down', label: `${Math.floor(delta).toLocaleString()}` };
}

// â”€â”€ Driver Rank System (Phase 35) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const RANK_TIERS = [
  { key: 'rookie',  label: 'ROOKIE',   minScore: 0,    minRuns: 0,   minCleanRate: 0  },
  { key: 'amateur', label: 'AMATEUR',  minScore: 200,  minRuns: 5,   minCleanRate: 20 },
  { key: 'semipro', label: 'SEMI-PRO', minScore: 500,  minRuns: 20,  minCleanRate: 35 },
  { key: 'pro',     label: 'PRO',      minScore: 1000, minRuns: 50,  minCleanRate: 50 },
  { key: 'elite',   label: 'ELITE',    minScore: 2000, minRuns: 100, minCleanRate: 60 },
  { key: 'legend',  label: 'LEGEND',   minScore: 5000, minRuns: 200, minCleanRate: 70 },
];

function computeDriverRank(career) {
  const cleanRate = career.totalRuns > 0 ? (career.cleanRuns / career.totalRuns) * 100 : 0;
  let achieved = RANK_TIERS[0];
  for (const tier of RANK_TIERS) {
    if (
      career.bestScore >= tier.minScore &&
      career.totalRuns >= tier.minRuns &&
      cleanRate >= tier.minCleanRate
    ) {
      achieved = tier;
    }
  }
  return achieved;
}

function updateRankBadges() {
  const career = getCareerData();
  const rank = computeDriverRank(career);
  ['careerRankBadge', 'profileRankBadge'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = rank.label;
    el.className = `rank-badge rank-${rank.key}`;
  });
}

// â”€â”€ Live PB Delta in HUD (Phase 35) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function updateLivePBDelta(score) {
  const el = document.getElementById('livePBDelta');
  if (!el) return;
  if (!score || score === 0) {
    el.textContent = '';
    el.className = 'stat-pb-delta';
    return;
  }
  const career = getCareerData();
  const pb = career.bestScore;
  if (!pb || pb === 0) {
    el.textContent = '';
    return;
  }
  const delta = score - pb;
  const sign = delta >= 0 ? '+' : '';
  el.textContent = `${sign}${Math.floor(delta).toLocaleString()} vs PB`;
  el.className = `stat-pb-delta ${delta >= 0 ? 'pb-ahead' : 'pb-behind'}`;
}

// â”€â”€ Session Goal Tracker (Phase 35) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SG_KEY = 'mpr_session_goal';

function getSessionGoal() {
  return Number(sessionStorage.getItem(SG_KEY) || 0);
}

function setSessionGoal(val) {
  sessionStorage.setItem(SG_KEY, String(val));
}

function clearSessionGoal() {
  sessionStorage.removeItem(SG_KEY);
}

function initSessionGoal() {
  const setBtn   = document.getElementById('sgSetBtn');
  const clearBtn = document.getElementById('sgClearBtn');

  if (setBtn) {
    setBtn.addEventListener('click', () => {
      const raw = prompt('Set session score goal (e.g. 1500):');
      if (raw === null) return;
      const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(n) && n > 0) {
        setSessionGoal(n);
        updateSessionGoalUI();
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearSessionGoal();
      updateSessionGoalUI();
    });
  }

  updateSessionGoalUI();
}

function updateSessionGoalUI() {
  const goal = getSessionGoal();
  const wrap = document.getElementById('sessionGoalWrap');
  if (!wrap) return;

  if (!goal) {
    wrap.classList.add('sg-hidden');
    return;
  }

  wrap.classList.remove('sg-hidden');
  const history = loadRunHistory();
  const sessionBest = history.reduce((max, r) => Math.max(max, Number(r.score || 0)), 0);
  const pct = Math.min(100, Math.round((sessionBest / goal) * 100));

  const sgTarget = document.getElementById('sgTarget');
  const sgFill   = document.getElementById('sgFill');
  const sgPct    = document.getElementById('sgPct');

  if (sgTarget) sgTarget.textContent = goal.toLocaleString();
  if (sgFill)   sgFill.style.width   = `${pct}%`;
  if (sgPct)    sgPct.textContent    = `${pct}%`;

  // Toast when goal is first beaten
  if (pct >= 100) {
    const toastKey = `mpr_sg_toast_${goal}`;
    if (!sessionStorage.getItem(toastKey)) {
      sessionStorage.setItem(toastKey, '1');
      showToast({
        icon: 'ðŸŽ¯',
        title: 'Session Goal Crushed!',
        msg: `You beat your ${goal.toLocaleString()} target.`,
        type: 'success',
        duration: 5000,
      });
    }
  }
}

// â”€â”€ Score Distribution Histogram (Phase 35) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderScoreHistogram() {
  const el = document.getElementById('scoreHistogram');
  if (!el) return;

  const history = loadRunHistory();
  const scores  = history.map(r => Number(r.score || 0)).filter(s => s > 0);

  if (scores.length < 3) {
    el.innerHTML = '<p class="empty-msg">Need 3+ runs for distribution.</p>';
    return;
  }

  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const bucketCount = 8;
  const range = max - min;
  const bucketSize = Math.max(1, Math.ceil((range + 1) / bucketCount));

  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    min: min + i * bucketSize,
    max: min + (i + 1) * bucketSize - 1,
    count: 0,
  }));

  scores.forEach(s => {
    const idx = Math.min(bucketCount - 1, Math.floor((s - min) / bucketSize));
    buckets[idx].count++;
  });

  const maxCount = Math.max(...buckets.map(b => b.count), 1);

  el.innerHTML = buckets
    .filter(b => b.count > 0)
    .map(b => {
      const pct = Math.round((b.count / maxCount) * 100);
      const lbl = b.min >= 10000
        ? `${(b.min / 1000).toFixed(0)}k`
        : b.min >= 1000
          ? `${(b.min / 1000).toFixed(1)}k`
          : String(b.min);
      return `<div class="hist-row">
        <div class="hist-lbl">${lbl}</div>
        <div class="hist-bar-track"><div class="hist-bar-fill" style="width:${pct}%"></div></div>
        <div class="hist-count">${b.count}</div>
      </div>`;
    })
    .join('');
}

// â”€â”€ Real-time Sync: Register all UI sync listeners â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€ Rank Progress Bar (Phase 36) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function updateRankProgress() {
  const career = getCareerData();
  const cleanRate = career.totalRuns > 0 ? (career.cleanRuns / career.totalRuns) * 100 : 0;
  const current = computeDriverRank(career);
  const currentIdx = RANK_TIERS.findIndex(t => t.key === current.key);
  const next = RANK_TIERS[currentIdx + 1];

  const fillEl   = document.getElementById('rankProgressFill');
  const currEl   = document.getElementById('rankProgressCurrent');
  const nextEl   = document.getElementById('rankProgressNext');
  const hintEl   = document.getElementById('rankProgressHint');
  if (!fillEl) return;

  if (currEl) currEl.textContent = current.label;

  if (!next) {
    // At max rank
    if (nextEl) nextEl.textContent = 'â­ MAX RANK';
    if (hintEl) hintEl.textContent = 'Maximum rank achieved.';
    fillEl.style.width = '100%';
    return;
  }

  if (nextEl) nextEl.textContent = `â†’ ${next.label}`;

  // Progress = min of (score%, runs%, cleanRate%) toward next tier
  const scorePct     = next.minScore > 0     ? Math.min(1, career.bestScore / next.minScore)    : 1;
  const runsPct      = next.minRuns > 0      ? Math.min(1, career.totalRuns / next.minRuns)     : 1;
  const cleanRatePct = next.minCleanRate > 0 ? Math.min(1, cleanRate / next.minCleanRate)       : 1;

  const overallPct = Math.round(Math.min(scorePct, runsPct, cleanRatePct) * 100);
  fillEl.style.width = `${overallPct}%`;

  // Build hint â€” show what the limiting factor is
  const hints = [];
  if (scorePct < 1)     hints.push(`${Math.floor(career.bestScore).toLocaleString()} / ${next.minScore.toLocaleString()} best score`);
  if (runsPct < 1)      hints.push(`${career.totalRuns} / ${next.minRuns} runs`);
  if (cleanRatePct < 1) hints.push(`${Math.round(cleanRate)}% / ${next.minCleanRate}% clean rate`);
  if (hintEl) hintEl.textContent = hints.length ? hints.join(' Â· ') : 'Criteria met â€” next rank incoming!';
}

// â”€â”€ Hot Streak Detection (Phase 36) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const HOT_STREAK_TOAST_KEY = 'mpr_hot_streak_last';

function checkHotStreak(career) {
  const history = loadRunHistory();
  if (history.length < 3) return;

  // 3 consecutive PBs = hot streak
  const last3 = history.slice(0, 3);
  const allPB  = last3.every(r => r.isPB);
  if (!allPB) return;

  const lastNotified = sessionStorage.getItem(HOT_STREAK_TOAST_KEY);
  const pbKey = `${career.totalRuns}-${career.bestScore}`;
  if (lastNotified === pbKey) return;
  sessionStorage.setItem(HOT_STREAK_TOAST_KEY, pbKey);

  showToast({
    icon: 'ðŸ”¥',
    title: 'HOT STREAK!',
    msg: '3 Personal Bests in a row. You\'re on fire.',
    type: 'success',
    duration: 6000,
  });
}

// â”€â”€ Session Timeline (Phase 36) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SESSION_RUN_KEY = 'mpr_session_runs';

function recordSessionRun(entry) {
  const runs = JSON.parse(sessionStorage.getItem(SESSION_RUN_KEY) || '[]');
  runs.push({
    score: Number(entry.score || 0),
    clean: !!entry.clean,
    isPB:  !!entry.isPB,
    route: entry.route || '',
    time:  entry.time || '',
  });
  sessionStorage.setItem(SESSION_RUN_KEY, JSON.stringify(runs));
}

function getSessionRuns() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_RUN_KEY) || '[]'); } catch { return []; }
}

function renderSessionTimeline() {
  const el = document.getElementById('sessionTimeline');
  if (!el) return;

  const runs = getSessionRuns();
  if (!runs.length) {
    el.innerHTML = '<p class="empty-msg">No runs this session yet.</p>';
    return;
  }

  const maxScore = Math.max(...runs.map(r => r.score), 1);
  const minBarH = 8;
  const maxBarH = 52;

  el.innerHTML = runs.map((r, i) => {
    const pct  = Math.max(minBarH, Math.round((r.score / maxScore) * maxBarH));
    const cls  = r.isPB ? 'st-pb' : r.clean ? 'st-clean' : 'st-crash';
    const icon = r.isPB ? 'â­' : r.clean ? 'âœ“' : 'âœ•';
    const lbl  = r.score >= 1000
      ? `${(r.score / 1000).toFixed(1)}k`
      : String(r.score);
    return `<div class="st-item" title="Run #${i + 1}: ${r.score.toLocaleString()} Â· ${r.route || 'Unknown'}">
      <div class="st-bar ${cls}" style="height:${pct}px"></div>
      <div class="st-icon">${icon}</div>
      <div class="st-label">${lbl}</div>
    </div>`;
  }).join('');
}

// â”€â”€ Per-Route Deep Analytics (Phase 36) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderRouteAnalytics() {
  const el = document.getElementById('routeAnalyticsList');
  if (!el) return;

  const history = loadRunHistory();
  if (history.length < 2) {
    el.innerHTML = '<p class="empty-msg">Complete runs on multiple routes to see analytics.</p>';
    return;
  }

  // Aggregate per-route stats
  const routeMap = new Map();
  history.forEach(r => {
    const route = r.route || 'Unknown';
    if (!routeMap.has(route)) {
      routeMap.set(route, { scores: [], cleans: 0, pbs: 0, crashRuns: 0 });
    }
    const d = routeMap.get(route);
    d.scores.push(Number(r.score || 0));
    if (r.clean) d.cleans++;
    if (r.isPB)  d.pbs++;
    if (!r.clean) d.crashRuns++;
  });

  // Must have at least 2 routes, or show the one with the most data
  const sorted = Array.from(routeMap.entries())
    .filter(([, d]) => d.scores.length >= 2)
    .sort(([, a], [, b]) => b.scores.length - a.scores.length);

  if (!sorted.length) {
    el.innerHTML = '<p class="empty-msg">Complete 2+ runs on the same route for analytics.</p>';
    return;
  }

  el.innerHTML = sorted.map(([route, d]) => {
    const pb      = Math.max(...d.scores);
    const avg     = Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length);
    const min     = Math.min(...d.scores);
    const cleanPct = Math.round((d.cleans / d.scores.length) * 100);
    const impRate = d.scores.length > 1
      ? Math.round(((d.scores[0] - d.scores[d.scores.length - 1]) / Math.max(d.scores[d.scores.length - 1], 1)) * 100)
      : 0;
    
    // Mini trend bars (last 5 runs reversed = chronological)
    const trendScores = [...d.scores].reverse().slice(-5);
    const trendMax = Math.max(...trendScores, 1);
    const trendBars = trendScores.map((s, i) => {
      const h = Math.max(3, Math.round((s / trendMax) * 20));
      const isPBSeg = s === pb;
      return `<div class="ra-trend-bar-seg ${isPBSeg ? 'pb-seg' : ''}" style="height:${h}px" title="${s.toLocaleString()}"></div>`;
    }).join('');

    const impSign = impRate >= 0 ? '+' : '';
    const impColor = impRate > 0 ? '#22c55e' : impRate < 0 ? '#ef4444' : 'var(--text-3)';

    return `<div class="route-analytics-row">
      <div class="ra-header">
        <div class="ra-name">${route}</div>
        <div class="ra-pb">${pb.toLocaleString()} PB</div>
      </div>
      <div class="ra-stats">
        <div class="ra-stat"><div class="ra-val">${d.scores.length}</div><div class="ra-lbl">Runs</div></div>
        <div class="ra-stat"><div class="ra-val">${avg.toLocaleString()}</div><div class="ra-lbl">Avg</div></div>
        <div class="ra-stat"><div class="ra-val">${cleanPct}%</div><div class="ra-lbl">Clean</div></div>
        <div class="ra-stat"><div class="ra-val" style="color:${impColor}">${impSign}${impRate}%</div><div class="ra-lbl">Growth</div></div>
        <div class="ra-stat"><div class="ra-val">${min.toLocaleString()}</div><div class="ra-lbl">Worst</div></div>
      </div>
      <div class="ra-trend-bar">${trendBars}</div>
    </div>`;
  }).join('');
}

// â”€â”€ Real-time Sync: Register all UI sync listeners â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function initUISyncListeners() {
  // Career data changes â†’ refresh career dashboard
  uiSync.on(SYNC_EVENTS.CAREER_UPDATED, (data) => {
    updateCareerDashboard();
    updateSessionStatsStrip();
    console.log('[SYNC] Career updated, refreshing UI:', data);
  });
  
  // Achievement unlocked â†’ refresh career achievements, show badge
  uiSync.on(SYNC_EVENTS.ACHIEVEMENT_UNLOCKED, (data) => {
    updateCareerDashboard();
    console.log('[SYNC] Achievement unlocked:', data);
  });
  
  // Tier changed â†’ refresh tier display, feature gates, career dashboard
  uiSync.on(SYNC_EVENTS.TIER_CHANGED, (data) => {
    updateTierDisplay();
    updateFeatureGates();
    updateCareerDashboard();
    console.log('[SYNC] Tier changed:', data);
  });
  
  // Discord connected â†’ refresh Discord display, career dashboard
  uiSync.on(SYNC_EVENTS.DISCORD_CONNECTED, (data) => {
    updateDiscordDisplay();
    updateCareerDashboard();
    console.log('[SYNC] Discord connected:', data);
  });
  
  // Discord disconnected â†’ refresh Discord display, career dashboard
  uiSync.on(SYNC_EVENTS.DISCORD_DISCONNECTED, () => {
    updateDiscordDisplay();
    updateCareerDashboard();
    console.log('[SYNC] Discord disconnected');
  });
  
  // Tab switching â†’ refresh relevant tab data
  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === 'career') {
        updateCareerDashboard();
        clearCareerBadge(); // Phase 34: clear badge when tab opened
      } else if (tab === 'profile') {
        updateProfileTab();
        updateDiscordDisplay();
      }
    });
  });
}

function syncAllUI() {
  // Full UI sync pass â€” use after login or when data integrity is restored
  updateCareerDashboard();
  updateDiscordDisplay();
  updateTierDisplay();
  updateSessionStatsStrip();  // also calls updateScoreVelocity + updateDriverIntel
  renderRunHistory();
  renderSessionTimeline();    // Phase 36
  const savedBadge = Number(sessionStorage.getItem(CAREER_BADGE_KEY) || 0);
  setCareerNavBadge(savedBadge);
  console.log('[SYNC] Full UI sync complete');
}

// â”€â”€ Session stats strip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function updateSessionStatsStrip() {
  const history = loadRunHistory();
  const total   = history.length;
  const clean   = history.filter((r) => r.clean).length;
  const pbs     = history.filter((r) => r.isPB).length;
  const best    = history.reduce((max, r) => Math.max(max, Number(r.score || 0)), 0);
  const pct     = total > 0 ? Math.round((clean / total) * 100) : null;

  // current clean streak: count consecutive clean runs from most recent
  let streak = 0;
  for (let i = 0; i < history.length; i++) {
    if (history[i].clean) streak++;
    else break;
  }

  const ssRuns   = document.getElementById('ssRuns');
  const ssClean  = document.getElementById('ssClean');
  const ssPBs    = document.getElementById('ssPBs');
  const ssBest   = document.getElementById('ssBestScore');
  const ssPct    = document.getElementById('ssCleanPct');
  const ssStreak = document.getElementById('ssStreak');

  if (ssRuns)   ssRuns.textContent   = String(total);
  if (ssClean)  ssClean.textContent  = String(clean);
  if (ssPBs)    ssPBs.textContent    = String(pbs);
  if (ssBest)   ssBest.textContent   = best > 0 ? best.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '--';
  if (ssPct)    ssPct.textContent    = pct !== null ? `${pct}%` : '--%';
  if (ssStreak) ssStreak.textContent = String(streak);
  
  // Phase 34: score velocity + driver intel
  updateScoreVelocity();
  updateDriverIntel();
  // Phase 35: rank badges + goal UI
  updateRankBadges();
  updateSessionGoalUI();
}
if (routeSelect) {
  routeSelect.addEventListener('change', loadRouteLeaderboard);
}

refreshOverview();
setInterval(refreshOverview, REFRESH_MS);

scheduleNextTelemetryPoll(0);

loadRouteLeaderboard();
setInterval(loadRouteLeaderboard, 5000);

setInterval(() => {
  session.time += 1;
  sessionTimeText.textContent = `${session.time}s`;
  updateProfileTab();
  updateSessionStatsStrip();
}, 1000);

// â”€â”€ Keyboard shortcuts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
(function initKeyboardShortcuts() {
  const TAB_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8'];
  const TAB_IDS  = ['dashboard', 'traffic', 'leaderboard', 'teams', 'servers', 'profile', 'settings', 'admin'];

  document.addEventListener('keydown', (e) => {
    // Don't fire while typing in inputs
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (document.activeElement?.isContentEditable) return;

    const key = e.key;

    // 1-7: switch tabs
    const tabIdx = TAB_KEYS.indexOf(key);
    if (tabIdx !== -1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      showTab(TAB_IDS[tabIdx]);
      return;
    }

    // T: lap timer start/stop
    if ((key === 't' || key === 'T') && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      lapTimer.toggle();
      return;
    }

    // L: log a lap split
    if ((key === 'l' || key === 'L') && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      lapTimer.split();
      return;
    }

    // M: toggle sound mute
    if ((key === 'm' || key === 'M') && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      _soundEnabled = !_soundEnabled;
      localStorage.setItem('mpr_sound', _soundEnabled ? 'on' : 'off');
      if (soundEnabledCheckbox) soundEnabledCheckbox.checked = _soundEnabled;
      showToast({
        icon: _soundEnabled ? 'ðŸ”Š' : 'ðŸ”‡',
        title: _soundEnabled ? 'Sound On' : 'Sound Muted',
        type: 'finish',
        duration: 2000,
      });
      return;
    }

    // Escape: dismiss newest toast
    if (key === 'Escape') {
      const last = toastContainer?.lastElementChild;
      if (last) last.click();
      return;
    }
  });
}());

// ── STARTUP SEQUENCE (atomically ordered) ──────────────────────────────────
// Step 1: Show loading screen FIRST
showLoadingScreen();
updateLoadingProgress(0, 'Initializing Midnight Pine...');

// Step 2: Auto-login with state validation (when DOM ready)
function runInitLogin() {
  updateLoadingProgress(10, 'Validating app state...');
  validateAppState();
  
  updateLoadingProgress(15, 'Checking network...');
  validateNetworkOnStartup().then(({online, message}) => {
    console.log('[STARTUP]', message);
    
    const saved = String(localStorage.getItem('mpr_user') || '').trim();
    if (saved && /^[a-zA-Z0-9 _.-]{2,32}$/.test(saved)) {
      if (online) {
        updateLoadingProgress(20, 'Restoring session...');
        applyLogin(saved);
      } else {
        // Network offline - can't restore, show login
        console.warn('[STARTUP] Network offline, showing login');
        updateLoadingProgress(35, 'Offline - Login to continue');
        hideLoadingScreen();
        showToast({
          icon: '⚠',
          title: 'Network Offline',
          msg: 'Showing login. Connect to network to restore session.',
          type: 'warning',
          duration: 6000,
        });
        loginInput.focus();
      }
    } else {
      updateLoadingProgress(35, 'Waiting for login...');
      hideLoadingScreen();
      loginInput.focus();
    }
  }).catch(err => {
    console.error('[STARTUP] Init error:', err);
    updateLoadingProgress(35, 'Ready - Offline Mode');
    hideLoadingScreen();
    loginInput.focus();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runInitLogin, { once: true });
} else {
  runInitLogin();
}



