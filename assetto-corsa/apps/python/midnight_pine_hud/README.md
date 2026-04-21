# Midnight Pine AC HUD

Assetto Corsa Python app for Midnight Pine live telemetry.

## What it shows

- Score
- Combo and max combo
- Speed, RPM, gear
- Drift score
- Route name
- Run state and official/unofficial badge
- Run timer
- Clean status
- Average speed
- Position X/Z

## Install

1. Copy the folder `midnight_pine_hud` into your Assetto Corsa apps path:
   - `.../Assetto Corsa/apps/python/midnight_pine_hud`
2. In Content Manager (or AC launcher), enable Python apps and enable `Midnight Pine HUD`.
3. Start the telemetry server from this repo so `http://127.0.0.1:3000/api/telemetry` is available.
4. Open the app in-game from the right-side app bar.

## Configure

Edit `settings.ini`:

- `url`: telemetry endpoint
- `poll_interval_ms`: pull frequency
- `timeout_ms`: request timeout
- `speed_alpha`: smoothing strength from `0.05` to `1.0`

## Notes

- If the feed is offline, the app shows `STATUS: OFFLINE` and a short link error.
- Route and official status are driven by server route logic.
