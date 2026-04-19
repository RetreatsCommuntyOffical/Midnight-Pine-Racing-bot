# Midnight Pine Racing Bot - System Requirements and Build Blueprint

Date: 2026-04-18
Project root: D:/midnight pine racing bot

## Core Goal
Keep players engaged outside the game through persistent progression, visible competition, and monetization-ready systems across Discord and FiveM integration.

## Current Coverage Snapshot

### Already present in this codebase
- Persistent player profile storage (MongoDB models)
- Run submission workflow and manual anti-cheat review
- Race creation/join/start/results flows
- Team system and team standings contribution
- Leaderboards (solo/street/circuit/teams) with weekly reset support
- Scheduled event reminders and scheduled release posting
- Stats command and map/vehicle leaderboard commands
- Season archive/reset and server setup automation

### Missing or partial relative to full requirements
- No economy (balance/shop/buy/currency ledger)
- No XP/level system and level-up rewards pipeline
- No daily streaks and rotating challenge generation/claims
- No membership purchase sync and perk activation lifecycle
- No real-time FiveM inbound integration endpoint/webhook validation layer
- No automated suspicious activity heuristics beyond manual review queue
- No admin command set for direct point adjustment, leaderboard bans, manual grants
- No explicit daily leaderboard reset scheduler and post cadence config
- No notification orchestration for big score/new records/welcome role pings in one policy layer

## Requirement Matrix (Target vs Status)

1) Player Data Tracking
- Target: drift points (lifetime + session), XP/level, currency, wins/stats, daily streaks
- Status: PARTIAL
- Existing: models/DriverProfile.js, models/RunSession.js, models/RaceEvent.js
- Missing: xp, level, wallet, streak, achievement state fields

2) Drift and Activity Logging
- Target: ingest game events (API/webhooks), combos/multipliers/crashes, milestone detection
- Status: PARTIAL
- Existing: commands/run.js, models/RunSubmission.js, core/racing/service.js
- Missing: external ingestion API, event signature validation, milestone engine

3) Leaderboards
- Target: daily/weekly/all-time, auto-reset, auto-post, /leaderboard drift and /top players
- Status: PARTIAL
- Existing: commands/leaderboard.js, core/racing/leaderboardPoster.js
- Missing: dedicated daily board fields and reset scheduler, /top players alias command

4) Rewards and Progression
- Target: level-up/challenge/event rewards (currency/boosts/roles)
- Status: MISSING
- Existing: none for XP/currency reward engine
- Missing: progression engine + reward transaction ledger

5) Daily/Weekly Challenges
- Target: rotating challenges, progress tracking, claim/auto-claim
- Status: MISSING
- Existing: none
- Missing: challenge templates, user challenge state, claim command

6) Membership System Integration
- Target: purchase/expiry sync, role perks, /member status, /upgrade
- Status: MISSING
- Existing: none
- Missing: membership model, sync adapter, perk resolver

7) Economy System
- Target: /balance, /shop, /buy with exploit prevention
- Status: MISSING
- Existing: none
- Missing: wallet, catalog, purchases, anti-abuse safeguards

8) Event System (Bot Controlled)
- Target: schedule, announcements, participant and score tracking, winner rewards
- Status: PARTIAL
- Existing: commands/event.js, models/RaceEventSchedule.js
- Missing: participant score table for scheduled events and auto-winner payout path

9) Notifications and Announcements
- Target: big scores, records, reminders, welcomes, role pings
- Status: PARTIAL
- Existing: scheduler reminders, release posts
- Missing: unified notification rules engine and threshold-based score announcements

10) Stats and Profile Commands
- Target: /profile and detailed /stats
- Status: PARTIAL
- Existing: commands/stats.js
- Missing: dedicated /profile command with progression/economy/challenge snapshot

11) Anti-Cheat and Validation
- Target: validate incoming data and detect spikes/exploits automatically
- Status: PARTIAL
- Existing: commands/runreview.js manual queue/approval
- Missing: automated anomaly scoring and hard validation policy on ingest

12) Admin Controls
- Target: points adjust/reset, leaderboard bans, manual rewards, event controls
- Status: PARTIAL
- Existing: some event and review controls
- Missing: full admin command suite and audit trail

13) Integration Layer
- Target: API bridge between FiveM and Discord for real-time sync
- Status: MISSING
- Existing: none
- Missing: authenticated webhook/API layer with idempotency

## Target Architecture Additions

Add these directories:
- core/economy/
- core/progression/
- core/challenges/
- core/membership/
- core/integration/
- core/antiCheat/
- core/notifications/

Add these models:
- models/Wallet.js
- models/Transaction.js
- models/ChallengeTemplate.js
- models/PlayerChallengeProgress.js
- models/Membership.js
- models/PlayerEventStat.js
- models/AdminAuditLog.js
- models/LeaderboardBan.js

Add these commands:
- commands/profile.js
- commands/balance.js
- commands/shop.js
- commands/buy.js
- commands/member.js
- commands/upgrade.js
- commands/top.js
- commands/admin.js

## Hardening Rules (Non-Negotiable)
- All economy writes must be atomic and ledgered (no direct balance mutation without transaction record).
- Idempotency key required for all external event ingestion.
- Reject impossible stat deltas (rate-limited point gain envelope).
- Store all admin mutations in AdminAuditLog.
- Do not reward from unverified or flagged events.
- Recompute derived leaderboard views from source-of-truth records where feasible.

## Phase Plan

Phase 1 (Foundation)
- Add data models for economy/progression/challenges/membership/admin audit.
- Extend DriverProfile with xp/level/streak fields.
- Add economy ledger service with atomic increment/decrement and reason codes.

Phase 2 (Player-Facing Commands)
- Implement /profile, /balance, /shop, /buy, /member status, /top players.
- Add formatted embeds and permission checks.

Phase 3 (Automation)
- Add challenge generation and progress tracker.
- Add daily + weekly board reset jobs and auto-post schedule.
- Add level-up + milestone notification dispatcher.

Phase 4 (Integration and Validation)
- Add authenticated FiveM webhook ingest endpoint.
- Add anti-cheat anomaly detector and flag queue.
- Add admin moderation controls and leaderboard ban flow.

Phase 5 (Stress and Abuse Testing)
- Test rapid command spam.
- Test duplicate event payload delivery.
- Test restart persistence and scheduled jobs.
- Test balance underflow/overflow guardrails.

## Immediate Execution Order
1. Implement economy model/service and /balance /shop /buy.
2. Implement profile extension with XP/level and /profile.
3. Implement challenge engine and reward pipeline.
4. Implement membership sync and perks resolver.
5. Implement FiveM webhook ingest with signature + idempotency.

## Verification Checklist
- Bot restart preserves wallets, levels, streaks, challenge progress, membership state.
- Daily and weekly resets occur once only and never double-award.
- Replaying the same ingest event does not duplicate rewards.
- Suspicious payloads are rejected and logged.
- Leaderboards match underlying source records after recompute.
