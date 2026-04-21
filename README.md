# 🌲 Midnight Pine Racing Bot

A full-featured Discord bot for the Midnight Pine Racing server — managing No Hesi runs, circuit races, teams, leaderboards, content drops, events, and full server setup automation.

---

## Requirements

- Node.js v18 or later
- MongoDB Atlas (or any MongoDB instance)
- A Discord bot application with the following permissions: **Manage Roles**, **Manage Channels**, **Send Messages**, **Embed Links**, **Read Message History**
- Discord bot intents: **Server Members**, **Message Content** (enabled in the Discord Developer Portal)

---

## Quick Start

### 1. Clone / Download

```
cd C:\path\to\midnight-pine-racing-bot
npm install
```

### 2. Configure `.env`

Copy `.env.example` to `.env` and fill in your values:

```env
BOT_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
HOME_GUILD_ID=your_discord_server_id
MONGO_URI=mongodb+srv://USER:PASS@CLUSTER.mongodb.net/midnightpineracing?retryWrites=true&w=majority
ALLOW_STARTUP_WITHOUT_DB=false
OWNER_ID=your_personal_discord_user_id
```

| Variable | Where to find it |
|---|---|
| `BOT_TOKEN` | Discord Developer Portal → Your App → Bot → Reset Token |
| `CLIENT_ID` | Discord Developer Portal → Your App → General Information → Application ID |
| `HOME_GUILD_ID` | Discord server → Right-click server icon → Copy Server ID (enable Developer Mode first) |
| `MONGO_URI` | MongoDB Atlas → Connect → Drivers → copy the connection string |
| `OWNER_ID` | Discord → Right-click your own profile → Copy User ID |

### 3. Start

```
npm start
```

### 4. Run `/setup-midnight-pine` in your server

This creates all categories, channels, and roles. Safe to re-run — existing items are skipped.

### 5. Run `/roles post` in your desired channel

Posts the division role picker with Street Driver / Circuit Driver / Racer buttons.

### 6. Optional: Tune traffic risk weights at runtime

Set these variables in `.env`:

```env
TRAFFIC_RISK_WEIGHT_BOOKING=0.80
TRAFFIC_RISK_WEIGHT_PRACTICE=1.00
TRAFFIC_RISK_WEIGHT_QUALIFYING=1.15
TRAFFIC_RISK_WEIGHT_RACE=1.30
TRAFFIC_RISK_WEIGHT_OFFLINE=1.00
```

After saving `.env`, run `/admin reload-risk-weights` to apply values without restarting the bot.

---

## Command Reference

### 🔧 Server Setup

| Command | Permission | Description |
|---|---|---|
| `/setup-midnight-pine` | Administrator | Auto-creates all roles, categories, and channels. Idempotent. |
| `/roles post` | Manage Guild | Posts the division role picker embed with buttons. |

---

### 🛠️ Admin Controls

| Command | Permission | Description |
|---|---|---|
| `/admin add-points` | Manage Guild | Add or remove points from a player. |
| `/admin ban-leaderboard` | Manage Guild | Hide a player from all leaderboards. |
| `/admin unban-leaderboard` | Manage Guild | Restore a player to leaderboards. |
| `/admin reset-weekly` | Manage Guild | Reset weekly points and boards. |
| `/admin sync-roles` | Manage Guild | Re-evaluate auto roles for all registered drivers. |
| `/admin reload-risk-weights` | Manage Guild | Reload traffic risk weights from `.env` at runtime. |

---

### 🌃 No Hesi Runs

| Command | Description |
|---|---|
| `/run start` | Begin a run session timer. |
| `/run end` | End your active session. |
| `/run submit distance_m time_sec top_speed crashes clean_run [proof_url] [clip_url] [map_name] [vehicle]` | Submit run stats. Pending anti-cheat review unless staff-verified. |

---

### 🏁 Race Management

| Command | Permission | Description |
|---|---|---|
| `/race create name track` | Any | Create a new race event. |
| `/race join name` | Any | Join an open race. |
| `/race start name` | Manage Guild | Lock the participant list and start. |
| `/race results name results` | Manage Guild | Submit results JSON: `[{"discordId":"123","position":1},{"discordId":"456","position":2,"dnf":true}]` |

---

### 👥 Teams

| Command | Description |
|---|---|
| `/team create name` | Create a new team (you become captain). |
| `/team join name` | Join an existing team. |
| `/team stats [name]` | View team stats and roster. |

---

### 📊 Leaderboards & Stats

| Command | Description |
|---|---|
| `/leaderboard [type] [weekly] [reset_weekly]` | View solo / street / circuit / teams leaderboard. |
| `/stats [user]` | View detailed driver stats and ranks. |
| `/teamstats team` | View detailed team stats. |
| `/mapleaderboard speeds map` | Top speeds on a specific map. |
| `/mapleaderboard maps` | All tracked maps. |
| `/mapleaderboard vehicles [vehicle]` | Vehicle performance rankings. |

---

### 📅 Events

| Command | Permission | Description |
|---|---|---|
| `/event create title starts_at [description] [ping_role] [channel]` | Manage Guild | Schedule a race event. ISO datetime format. Reminders at 60, 15, 5 min. |
| `/event list` | Any | List upcoming scheduled events. |

---

### 🔐 Run Review (Anti-Cheat)

| Command | Permission | Description |
|---|---|---|
| `/runreview pending` | Manage Guild | List pending run submissions. |
| `/runreview approve id` | Manage Guild | Approve a run submission. |
| `/runreview reject id` | Manage Guild | Reject a run and roll back points. |

---

### 🗺️ Content Drops

| Command | Permission | Description |
|---|---|---|
| `/release map title [...]` | Manage Guild | Post or schedule a map drop. |
| `/release vehicle title [...]` | Manage Guild | Post or schedule a vehicle drop. |
| `/release update version changes` | Manage Guild | Post patch notes. Changes format: `"Fixes: item1, item2 \| Added: item3"` |
| `/release sneak [description] [image_url]` | Manage Guild | Post a hype teaser. |
| `/release list` | Manage Guild | List upcoming scheduled releases. |
| `/release post release_id` | Manage Guild | Force-post a draft or scheduled release now. |

---

### 🧪 Testing Program

| Command | Permission | Description |
|---|---|---|
| `/testing announce title [...]` | Manage Guild | Post early-access content to `🧪┃testing-access`. |
| `/testing assign member grant` | Manage Guild | Grant or revoke the `🧪 Tester` role. |

---

### 🏆 Seasons

| Command | Permission | Description |
|---|---|---|
| `/season end tag` | Administrator | Archive season, snapshot champions, reset all points. |
| `/season history` | Any | View past season champions. |

---

## Architecture

```
midnight-pine-racing-bot/
├── bot.js                       ← entry point
├── core/
│   ├── client.js                ← Discord client (intents)
│   ├── database.js              ← MongoDB connection
│   ├── commandHandler.js        ← file-based command loader + guild registration
│   ├── interactionHandler.js    ← slash command dispatch + button role handler
│   └── racing/
│       ├── points.js            ← pure scoring engine (no DB)
│       ├── points.test.js       ← unit tests (node:test)
│       ├── service.js           ← all business logic
│       ├── scheduler.js         ← 60s tick: event reminders + auto-releases
│       ├── leaderboardPoster.js ← embed builder + channel updater
│       ├── releaseService.js    ← content drop embeds + posting
│       └── seasonService.js     ← season archive + full reset
├── models/                      ← 8 Mongoose schemas
│   ├── DriverProfile.js
│   ├── Team.js
│   ├── RaceEvent.js
│   ├── RunSession.js
│   ├── RunSubmission.js
│   ├── RaceEventSchedule.js
│   ├── SeasonArchive.js
│   └── Release.js
└── commands/                    ← 14 slash commands
```

---

## Running Tests

```
node --test core/racing/points.test.js
```

5 tests covering circuit scoring, No Hesi calculations, crash penalties, and tier thresholds.

---

## Production Deployment (PM2)

```
npm install -g pm2
pm2 start pm2.config.js
pm2 save
pm2-startup install
```

---

## Auto-Posting Schedule

| Feature | Interval |
|---|---|
| Leaderboard refresh | Every 4 hours |
| Event reminders (60 / 15 / 5 min) | Every 60 seconds |
| Scheduled content drops | Every 60 seconds |

---

## Desktop Traffic Risk Tuning

The desktop overview endpoint (`GET /desktop/overview`) computes live traffic risk using:

- crashes per player
- average speed
- traffic density
- session weighting (Booking, Practice, Qualifying, Race, Offline)

Session weighting is controlled by:

- `TRAFFIC_RISK_WEIGHT_BOOKING`
- `TRAFFIC_RISK_WEIGHT_PRACTICE`
- `TRAFFIC_RISK_WEIGHT_QUALIFYING`
- `TRAFFIC_RISK_WEIGHT_RACE`
- `TRAFFIC_RISK_WEIGHT_OFFLINE`

Allowed range per value is `0.10` to `3.00`.

To apply changed values without restart:

1. Edit `.env`
2. Run `/admin reload-risk-weights`
3. Verify returned weight values in the command response

Staff quick procedures and incident profiles are documented in [STAFF_RISK_RUNBOOK.md](STAFF_RISK_RUNBOOK.md).

---

## Channels Created by `/setup-midnight-pine`

| Category | Channels |
|---|---|
| 📋 INFORMATION | rules, announcements, welcome |
| 🗺️ MIDNIGHT RELEASES | map-releases, vehicle-releases, update-log, sneak-peeks, testing-access |
| 🏁 RACE CONTROL | race-lobby, race-results, run-submissions |
| 📊 LEADERBOARDS | solo-board, street-board, circuit-board, team-board |
| 👥 TEAMS | team-hub, team-roster |
| 📅 EVENTS | events, event-alerts |
| 💬 COMMUNITY | general, media, suggestions |
| 🔧 STAFF ROOM *(private)* | staff-chat, run-review, bot-logs |
