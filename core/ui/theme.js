'use strict';

/**
 * core/ui/theme.js
 * MIDNIGHT PINE RACING — Centralized embed + button builder
 *
 * All bot UI must go through these helpers to guarantee:
 *  - Consistent color palette
 *  - Consistent footer + timestamp
 *  - Max 1 embed per message (enforced upstream by messageBroker)
 *  - Max 5 buttons per action row, max 5 rows
 */

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

// ── Palette ───────────────────────────────────────────────────────────────────

const COLORS = {
    primary:   0x4a235a,   // deep purple — default
    accent:    0x6c3483,   // mid purple — highlights
    neon:      0x9b59b6,   // bright purple — wins/rewards
    blue:      0x0a3d62,   // midnight blue — circuit
    teal:      0x00cec9,   // neon teal — rush/speed
    gold:      0xfdcb6e,   // gold — rankings / top
    orange:    0xe17055,   // drift orange
    green:     0x00b894,   // success / team
    red:       0xd63031,   // danger / ban
    grey:      0x636e72,   // muted / offline
    dark:      0x1e0a2e,   // near-black — backgrounds in embed image frames
};

const FOOTER    = 'MIDNIGHT PINE RACING';
const DIVIDER   = '━━━━━━━━━━━━━━━━━━';
const BLANK     = '\u200b';

// ── Core embed factory ────────────────────────────────────────────────────────

/**
 * Create a pre-styled EmbedBuilder.
 * @param {object} opts
 * @param {string}  opts.title
 * @param {string}  [opts.description]
 * @param {number}  [opts.color]      – defaults to COLORS.primary
 * @param {string}  [opts.thumbnail]
 * @param {string}  [opts.image]
 * @param {Array}   [opts.fields]
 * @param {string}  [opts.footer]     – appended after FOOTER
 * @returns {EmbedBuilder}
 */
function embed(opts = {}) {
    const e = new EmbedBuilder()
        .setColor(opts.color ?? COLORS.primary)
        .setTitle(opts.title || BLANK)
        .setFooter({ text: opts.footer ? `${FOOTER} · ${opts.footer}` : FOOTER })
        .setTimestamp();

    if (opts.description) e.setDescription(opts.description);
    if (opts.thumbnail)   e.setThumbnail(opts.thumbnail);
    if (opts.image)       e.setImage(opts.image);
    if (opts.fields?.length) e.addFields(...opts.fields);

    return e;
}

// ── Specialized embed presets ─────────────────────────────────────────────────

function profileEmbed(opts = {})     { return embed({ color: COLORS.primary,   ...opts }); }
function statsEmbed(opts = {})       { return embed({ color: COLORS.accent,    ...opts }); }
function leaderboardEmbed(opts = {}) { return embed({ color: COLORS.gold,      ...opts }); }
function shopEmbed(opts = {})        { return embed({ color: COLORS.neon,      ...opts }); }
function challengeEmbed(opts = {})   { return embed({ color: COLORS.teal,      ...opts }); }
function eventEmbed(opts = {})       { return embed({ color: COLORS.blue,      ...opts }); }
function runEmbed(opts = {})         { return embed({ color: COLORS.primary,   ...opts }); }
function raceEmbed(opts = {})        { return embed({ color: COLORS.blue,      ...opts }); }
function teamEmbed(opts = {})        { return embed({ color: COLORS.green,     ...opts }); }
function walletEmbed(opts = {})      { return embed({ color: COLORS.gold,      ...opts }); }
function membershipEmbed(opts = {})  { return embed({ color: COLORS.neon,      ...opts }); }
function radioEmbed(opts = {})       { return embed({ color: COLORS.primary,   ...opts }); }
function successEmbed(opts = {})     { return embed({ color: COLORS.green,     ...opts }); }
function dangerEmbed(opts = {})      { return embed({ color: COLORS.red,       ...opts }); }
function warnEmbed(opts = {})        { return embed({ color: COLORS.orange,    ...opts }); }
function offlineEmbed(opts = {})     { return embed({ color: COLORS.grey,      ...opts }); }

// ── Button factory ────────────────────────────────────────────────────────────

/**
 * Create a single ButtonBuilder.
 * @param {object} opts
 * @param {string} opts.id      – customId
 * @param {string} opts.label
 * @param {'Primary'|'Secondary'|'Success'|'Danger'|'Link'} [opts.style='Secondary']
 * @param {string} [opts.emoji]
 * @param {boolean} [opts.disabled]
 * @param {string} [opts.url]   – for Link buttons
 * @returns {ButtonBuilder}
 */
function btn(opts) {
    const style = ButtonStyle[opts.style || 'Secondary'];
    const b = new ButtonBuilder().setStyle(style).setLabel(opts.label);
    if (opts.style === 'Link' && opts.url) {
        b.setURL(opts.url);
    } else {
        b.setCustomId(opts.id);
    }
    if (opts.emoji)    b.setEmoji(opts.emoji);
    if (opts.disabled) b.setDisabled(true);
    return b;
}

/**
 * Wrap an array of ButtonBuilders into ActionRow(s).
 * Automatically splits into rows of max 5.
 * @param {ButtonBuilder[]} buttons
 * @returns {ActionRowBuilder[]}
 */
function rows(buttons) {
    if (!buttons?.length) return [];
    const chunks = [];
    for (let i = 0; i < buttons.length; i += 5) {
        chunks.push(new ActionRowBuilder().addComponents(...buttons.slice(i, i + 5)));
    }
    return chunks;
}

// ── Common button sets ────────────────────────────────────────────────────────

const Buttons = {
    viewStats:    (userId)   => btn({ id: `ui_stats_${userId}`,        label: 'View Stats',    style: 'Secondary', emoji: '📊' }),
    viewProfile:  (userId)   => btn({ id: `ui_profile_${userId}`,      label: 'View Profile',  style: 'Secondary', emoji: '🏁' }),
    viewBalance:  (userId)   => btn({ id: `ui_balance_${userId}`,      label: 'Wallet',        style: 'Secondary', emoji: '🪙' }),
    claimAll:     ()         => btn({ id: 'ui_challenge_claim_all',     label: 'Claim All',     style: 'Success',   emoji: '✅' }),
    openShop:     ()         => btn({ id: 'ui_shop_open',              label: 'Open Shop',     style: 'Primary',   emoji: '🛒' }),
    joinEvent:    (eventId)  => btn({ id: `ui_event_join_${eventId}`,  label: 'Join Event',    style: 'Success',   emoji: '🏁' }),
    viewEvent:    (eventId)  => btn({ id: `ui_event_view_${eventId}`,  label: 'View Details',  style: 'Secondary', emoji: '📋' }),
    radioSwitch:  ()         => btn({ id: 'ui_radio_list',             label: 'Radio',         style: 'Secondary', emoji: '📻' }),
    upgradeMenu:  ()         => btn({ id: 'ui_upgrade_menu',           label: 'Upgrade',       style: 'Primary',   emoji: '⬆️' }),
    teamStats:      ()           => btn({ id: 'ui_team_stats',             label: 'Team Stats',      style: 'Secondary', emoji: '👥' }),
    teamStatsByName: (teamName) => btn({ id: `ui_team_stats_${encodeURIComponent(teamName)}`, label: 'View Team Stats', style: 'Secondary', emoji: '👥' }),
    createTeam:     ()           => btn({ id: 'teamhub_create',            label: 'Create a Team',   style: 'Primary',   emoji: '🏗️' }),
    applyToTeam:    ()           => btn({ id: 'teamhub_apply',             label: 'Apply to Team',   style: 'Success',   emoji: '📋' }),
    refreshBoard: (type)     => btn({ id: `ui_leaderboard_${type}`,    label: 'Refresh',       style: 'Secondary', emoji: '🔄' }),
    nextStation:  ()         => btn({ id: 'ui_radio_next',             label: 'Next Station',  style: 'Secondary', emoji: '⏭️' }),
    runHistory:   (userId)   => btn({ id: `ui_runs_${userId}`,         label: 'Run History',   style: 'Secondary', emoji: '🌃' }),
};

// ── Section helpers ───────────────────────────────────────────────────────────

/** Horizontal divider field */
function dividerField() {
    return { name: DIVIDER, value: BLANK, inline: false };
}

/** XP bar visual (10-unit bar) */
function xpBar(current, required, barLen = 10) {
    const pct   = Math.min(1, current / Math.max(1, required));
    const filled = Math.round(pct * barLen);
    return '▰'.repeat(filled) + '▱'.repeat(barLen - filled) + ` ${Math.round(pct * 100)}%`;
}

/** Format unix timestamp for Discord */
function ts(date, fmt = 'R') {
    return `<t:${Math.floor(new Date(date).getTime() / 1000)}:${fmt}>`;
}

module.exports = {
    COLORS, FOOTER, DIVIDER, BLANK,
    embed,
    profileEmbed, statsEmbed, leaderboardEmbed, shopEmbed, challengeEmbed,
    eventEmbed, runEmbed, raceEmbed, teamEmbed, walletEmbed, membershipEmbed,
    radioEmbed, successEmbed, dangerEmbed, warnEmbed, offlineEmbed,
    btn, rows, Buttons,
    dividerField, xpBar, ts,
};
