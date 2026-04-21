# Midnight Pine Staff Runbook - Traffic Risk Controls

This runbook is for staff and admins operating the live traffic-risk system without restarting the bot.

## Preconditions

- You have Manage Guild permission in Discord.
- Bot slash commands are deployed.
- The bot process is running.
- You can edit the project .env file.

## Command Quick Reference

- Reload risk weights at runtime:
  - /admin reload-risk-weights
- Reload with audit reason:
  - /admin reload-risk-weights reason: "traffic spikes during race window"

## Standard Tuning Procedure (No Restart)

1. Edit .env values:

TRAFFIC_RISK_WEIGHT_BOOKING=0.80
TRAFFIC_RISK_WEIGHT_PRACTICE=1.00
TRAFFIC_RISK_WEIGHT_QUALIFYING=1.15
TRAFFIC_RISK_WEIGHT_RACE=1.30
TRAFFIC_RISK_WEIGHT_OFFLINE=1.00

2. In Discord, run:

/admin reload-risk-weights

3. Confirm the command response embed returns expected values.

4. Validate in the desktop panel:
- Risk Score updates
- Session Weight matches expected session
- Risk Level tracks score band

## Emergency Stabilization Profile

Use this profile when crash storms or severe volatility cause unstable risk readings:

TRAFFIC_RISK_WEIGHT_BOOKING=0.70
TRAFFIC_RISK_WEIGHT_PRACTICE=0.90
TRAFFIC_RISK_WEIGHT_QUALIFYING=1.05
TRAFFIC_RISK_WEIGHT_RACE=1.15
TRAFFIC_RISK_WEIGHT_OFFLINE=0.90

Then run:

/admin reload-risk-weights reason: "emergency stabilization"

## High-Sensitivity Profile (Investigation Mode)

Use this profile when you need aggressive detection sensitivity:

TRAFFIC_RISK_WEIGHT_BOOKING=0.90
TRAFFIC_RISK_WEIGHT_PRACTICE=1.15
TRAFFIC_RISK_WEIGHT_QUALIFYING=1.30
TRAFFIC_RISK_WEIGHT_RACE=1.50
TRAFFIC_RISK_WEIGHT_OFFLINE=1.00

Then run:

/admin reload-risk-weights reason: "high sensitivity investigation"

## Safe Rollback Procedure

1. Restore known-good defaults in .env:

TRAFFIC_RISK_WEIGHT_BOOKING=0.80
TRAFFIC_RISK_WEIGHT_PRACTICE=1.00
TRAFFIC_RISK_WEIGHT_QUALIFYING=1.15
TRAFFIC_RISK_WEIGHT_RACE=1.30
TRAFFIC_RISK_WEIGHT_OFFLINE=1.00

2. Apply without restart:

/admin reload-risk-weights reason: "rollback to defaults"

3. Confirm values in command response.

## If Reload Command Is Missing

Deploy slash commands from project root:

npm run deploy:commands

Wait for successful registration, then retry:

/admin reload-risk-weights

## Troubleshooting

- Command says Staff only:
  - Your Discord account lacks Manage Guild permission.

- Values did not change:
  - Confirm .env was saved in the running bot environment.
  - Run /admin reload-risk-weights again and verify embed values.

- Out-of-range value behavior:
  - Values are clamped between 0.10 and 3.00.
  - Non-numeric values fall back to defaults.

- Desktop UI still stale:
  - Wait one polling cycle (about 30 seconds) and recheck.

## Change Logging Policy

Always include a reason in reload commands during incidents.

Preferred reason format:

<incident-or-purpose> | <expected impact> | <staff handle>

Example:

/admin reload-risk-weights reason: "race crash spike | reduce false criticals | hank"
