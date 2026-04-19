'use strict';

/**
 * core/racing/autoRoleService.js
 *
 * Phase 4 — Automatic role assignment based on driver stats.
 *
 * Rules:
 *  - Street Driver    → driver has submitted ≥1 No Hesi run
 *  - Circuit Driver   → driver has ≥1 circuit point
 *  - Verified Racer   → driver has ≥100 total points
 *  - Tier roles       → Rookie / Amateur / Pro / Elite (based on tier field)
 *  - Run streak badge → 🔥 Hot Streak if noCrashStreak ≥ 5
 *
 * Called after: run submissions, race results, manual admin point updates.
 */

const ROLE_NAME_MAP = {
    street_driver:   '🏎️ Street Driver',
    circuit_driver:  '🏁 Circuit Driver',
    verified_racer:  '🚦 Racer',
    tier_rookie:     '🟤 Rookie',
    tier_amateur:    '⚪ Amateur',
    tier_pro:        '🟡 Pro',
    tier_elite:      '🔴 Elite',
    hot_streak:      '🔥 Hot Streak',
};

const TIER_ROLE_KEYS = ['tier_rookie', 'tier_amateur', 'tier_pro', 'tier_elite'];

/**
 * Resolve a role from the guild by display name.
 * Returns the Role or null if not found.
 */
function findRole(guild, roleName) {
    return guild.roles.cache.find((r) => r.name === roleName) || null;
}

/**
 * Safely add a role to a member — no-ops if they already have it.
 */
async function grantRole(member, role) {
    if (!role || member.roles.cache.has(role.id)) return;
    await member.roles.add(role).catch(() => null);
}

/**
 * Safely remove a role from a member — no-ops if they don't have it.
 */
async function revokeRole(member, role) {
    if (!role || !member.roles.cache.has(role.id)) return;
    await member.roles.remove(role).catch(() => null);
}

/**
 * Sync all auto-assignable roles for a single member based on their driver profile.
 *
 * @param {import('discord.js').GuildMember} member
 * @param {object} profile  DriverProfile document (plain object or mongoose doc)
 */
async function syncRolesForMember(member, profile) {
    if (!member || !profile) return;
    const guild = member.guild;

    // ── Division roles ──────────────────────────────────────────────────────
    const streetRole  = findRole(guild, ROLE_NAME_MAP.street_driver);
    const circuitRole = findRole(guild, ROLE_NAME_MAP.circuit_driver);
    const racerRole   = findRole(guild, ROLE_NAME_MAP.verified_racer);

    if (streetRole) {
        (profile.noHesiRuns > 0) ? await grantRole(member, streetRole) : await revokeRole(member, streetRole);
    }
    if (circuitRole) {
        (profile.circuitPoints > 0) ? await grantRole(member, circuitRole) : await revokeRole(member, circuitRole);
    }
    if (racerRole) {
        (profile.totalPoints >= 100) ? await grantRole(member, racerRole) : await revokeRole(member, racerRole);
    }

    // ── Tier roles — mutually exclusive ────────────────────────────────────
    const activeTierKey  = `tier_${(profile.tier || 'rookie').toLowerCase()}`;
    for (const key of TIER_ROLE_KEYS) {
        const role = findRole(guild, ROLE_NAME_MAP[key]);
        if (!role) continue;
        (key === activeTierKey) ? await grantRole(member, role) : await revokeRole(member, role);
    }

    // ── Hot Streak badge ───────────────────────────────────────────────────
    const streakRole = findRole(guild, ROLE_NAME_MAP.hot_streak);
    if (streakRole) {
        (profile.noCrashStreak >= 5) ? await grantRole(member, streakRole) : await revokeRole(member, streakRole);
    }
}

/**
 * Sync auto roles for a user by discordId.
 * Resolves the guild member and driver profile internally.
 * Safe to call fire-and-forget (.catch(() => null)).
 *
 * @param {import('discord.js').Client} client
 * @param {string} discordId
 */
async function syncAutoRoles(client, discordId) {
    if (!client?.isReady?.()) return;

    const DriverProfile = require('../../models/DriverProfile');
    const profile = await DriverProfile.findOne({ discordId }).catch(() => null);
    if (!profile) return;

    const HOME_GUILD_ID = process.env.HOME_GUILD_ID;
    const guild = (HOME_GUILD_ID && client.guilds.cache.get(HOME_GUILD_ID)) || client.guilds.cache.first();
    if (!guild) return;

    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) return;

    await syncRolesForMember(member, profile);
}

/**
 * Bulk sync auto roles for all members with a driver profile.
 * Intended for a one-time staff command or periodic maintenance.
 *
 * @param {import('discord.js').Client} client
 * @returns {{ synced: number, skipped: number, errors: number }}
 */
async function bulkSyncAutoRoles(client) {
    if (!client?.isReady?.()) return { synced: 0, skipped: 0, errors: 0 };

    const DriverProfile = require('../../models/DriverProfile');
    const HOME_GUILD_ID = process.env.HOME_GUILD_ID;
    const guild = (HOME_GUILD_ID && client.guilds.cache.get(HOME_GUILD_ID)) || client.guilds.cache.first();
    if (!guild) return { synced: 0, skipped: 0, errors: 0 };

    const profiles = await DriverProfile.find({}).catch(() => []);
    let synced = 0, skipped = 0, errors = 0;

    for (const profile of profiles) {
        const member = await guild.members.fetch(profile.discordId).catch(() => null);
        if (!member) { skipped++; continue; }
        try {
            await syncRolesForMember(member, profile);
            synced++;
        } catch {
            errors++;
        }
        // Small delay to avoid hitting rate limits
        await new Promise((r) => setTimeout(r, 300));
    }

    return { synced, skipped, errors };
}

module.exports = { syncAutoRoles, bulkSyncAutoRoles, syncRolesForMember, ROLE_NAME_MAP };
