Config = {}

-- ── Stations & Playlists ──────────────────────────────────────────────────────
-- Tracks: url can be a direct MP3/AAC stream, Icecast/Shoutcast stream,
--         or any publicly accessible audio file URL.
--         Leave url = '' to silence a slot until admin adds a URL via /music-admin.
Config.Stations = {
    ['midnight-fm'] = {
        name        = 'MIDNIGHT FM',
        icon        = '🌙',
        description = 'Chill night drive — synthwave & lo-fi',
        shuffle     = true,
        loop        = true,
        tracks      = {
            { title = 'Neon Drive',   artist = 'Midnight Pine',   url = '' },
            { title = 'After Hours',  artist = 'Night Collective', url = '' },
            { title = 'Street Glow',  artist = 'Synthwave Labs',   url = '' },
        },
    },
    ['drift-fm'] = {
        name        = 'DRIFT FM',
        icon        = '🔥',
        description = 'Phonk & drift culture — hard bass',
        shuffle     = true,
        loop        = true,
        tracks      = {
            { title = 'Phonk Mode',       artist = 'DRIFT.exe',      url = '' },
            { title = 'Slide Season',     artist = 'Yokohama Nights', url = '' },
            { title = 'Tokyo Drift Tape', artist = 'VHS Phonk',      url = '' },
        },
    },
    ['rush-fm'] = {
        name        = 'RUSH FM',
        icon        = '⚡',
        description = 'High energy — trap, EDM, race-day anthems',
        shuffle     = true,
        loop        = true,
        tracks      = {
            { title = 'Full Send',   artist = 'Rush Hour',      url = '' },
            { title = 'Red Zone',    artist = 'Adrenaline Cut', url = '' },
            { title = 'Hyperdrive', artist = 'NRG Collective',  url = '' },
        },
    },
}

Config.StationOrder   = { 'midnight-fm', 'drift-fm', 'rush-fm' }
Config.DefaultStation = 'midnight-fm'

-- ── Volume ────────────────────────────────────────────────────────────────────
Config.DefaultVolume  = 0.45   -- 0.0 – 1.0
Config.FadeStep       = 0.04   -- volume units per tick during fade
Config.FadeTick       = 80     -- ms between fade steps

-- ── Gameplay State Thresholds ─────────────────────────────────────────────────
Config.DriftSpeedMin   = 28    -- mph — minimum speed to register drift
Config.DriftAngleMin   = 22    -- degrees — minimum slip angle for drift state
Config.HighSpeedThresh = 110   -- mph — threshold for speed mode

-- ── State → Station auto-switch ───────────────────────────────────────────────
Config.StateStations = {
    free_roam   = 'midnight-fm',
    drifting    = 'drift-fm',
    high_speed  = 'midnight-fm',
    race_event  = 'rush-fm',
    drift_event = 'drift-fm',
}

-- ── Discord webhook bridge ────────────────────────────────────────────────────
-- In server.cfg set:
--   set midnight_music_webhook_url   "http://<bot-ip>:8787/ingest/music"
--   set midnight_music_webhook_secret "your-secret-here"
Config.WebhookEnabled = true

-- ── Keybinds (client defaults — players can rebind in GTA V settings) ─────────
Config.Keys = {
    toggle_music = 'F7',
    skip_track   = 'F8',
    next_station = 'F9',
    volume_up    = 'PAGEUP',
    volume_down  = 'PAGEDOWN',
}

-- ── HUD ───────────────────────────────────────────────────────────────────────
Config.HudEnabled  = true
Config.HudPosition = 'bottom-right'  -- 'bottom-right' | 'bottom-left' | 'top-right'
