'use strict';

/**
 * core/ui/buttonHandlers.js
 * Handles all custom button interactions prefixed with `ui_`
 *
 * Pattern: customId = `ui_<handler>_<...args>`
 * Handlers must:
 *  - Acknowledge immediately (deferUpdate or deferReply ephemeral)
 *  - Edit original message or send ephemeral reply — never send a new non-ephemeral message
 *  - Disable themselves after single-use actions (claim, join)
 */

const {
    profileEmbed, statsEmbed, walletEmbed, challengeEmbed, shopEmbed,
    eventEmbed, leaderboardEmbed, radioEmbed, membershipEmbed,
    successEmbed, warnEmbed,
    rows, Buttons, DIVIDER, ts, xpBar,
} = require('./theme');

// ── Lazy-require services (avoids circular deps at startup) ───────────────────

const svc = {
    stats:       () => require('../racing/service'),
    economy:     () => require('../economy/service'),
    progression: () => require('../progression/service'),
    challenges:  () => require('../challenges/service'),
    membership:  () => require('../membership/service'),
    music:       () => require('../music/stationManager'),
    event:       () => require('../racing/service'),
    team:        () => require('../racing/service'),
};

// ── Per-user cooldowns to prevent button spam (1.5 s) ────────────────────────

const _cooldowns = new Map();
const COOLDOWN_MS = 1500;

function _checkCooldown(userId) {
    const last = _cooldowns.get(userId) || 0;
    if (Date.now() - last < COOLDOWN_MS) return false;
    _cooldowns.set(userId, Date.now());
    return true;
}

// ── Handler registry ──────────────────────────────────────────────────────────

/**
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string[]} parts  – customId split by '_', parts[0]='ui', parts[1]=handler key
 */
async function handleUiButton(interaction) {
    if (!interaction.customId.startsWith('ui_')) return false;
    const parts = interaction.customId.split('_');
    // parts: ['ui', handlerKey, ...args]
    const key = parts.slice(1, 3).join('_');  // e.g. 'stats', 'profile', 'event_join'

    if (!_checkCooldown(interaction.user.id)) {
        await interaction.reply({ content: 'Please wait a moment before clicking again.', flags: 64 });
        return true;
    }

    try {
        // ── Profile button ──────────────────────────────────────────────────
        if (key === 'profile') {
            const targetId = parts[3] || interaction.user.id;
            await interaction.deferReply({ flags: 64 });
            const { getDriverStats, getDriverRank } = svc.stats();
            const { getWalletSummary } = svc.economy();
            const { xpRequiredForLevel } = svc.progression();
            const profile = await getDriverStats(targetId);
            if (!profile) {
                await interaction.editReply({ content: 'No profile found yet — race first!' });
                return true;
            }
            const wallet    = await getWalletSummary(targetId);
            const soloRank  = await getDriverRank(targetId, 'solo');
            const required  = xpRequiredForLevel(profile.level || 1);
            const bar       = xpBar(profile.xp || 0, required);
            const embed = profileEmbed({
                title:       `🏁 ${profile.displayName}`,
                description: `Level **${profile.level || 1}** · Tier **${profile.tier || 'Rookie'}**\n\n${DIVIDER}`,
                fields: [
                    { name: '⭐ XP Progress',     value: bar,                                    inline: false },
                    { name: '🏆 Total Points',    value: String(profile.totalPoints || 0),       inline: true  },
                    { name: '📊 Solo Rank',       value: soloRank ? `#${soloRank}` : 'Unranked', inline: true  },
                    { name: '🪙 Coins',            value: String(wallet.balance),                 inline: true  },
                    { name: '🌃 Runs',             value: String(profile.noHesiRuns || 0),        inline: true  },
                    { name: '💨 Best Speed',       value: `${profile.bestNoHesiTopSpeed || 0} mph`, inline: true },
                    { name: '✅ Clean %',          value: profile.noHesiRuns ? `${((profile.cleanRuns / profile.noHesiRuns) * 100).toFixed(1)}%` : '—', inline: true },
                ],
            });
            const btnRow = rows([Buttons.viewStats(targetId), Buttons.runHistory(targetId), Buttons.viewBalance(targetId)]);
            await interaction.editReply({ embeds: [embed], components: btnRow });
            return true;
        }

        // ── Stats button ────────────────────────────────────────────────────
        if (key === 'stats') {
            const targetId = parts[3] || interaction.user.id;
            await interaction.deferReply({ flags: 64 });
            const { getDriverStats, getDriverRank } = svc.stats();
            const profile = await getDriverStats(targetId);
            if (!profile) {
                await interaction.editReply({ content: 'No stats found yet.' });
                return true;
            }
            const [soloRank, streetRank, circuitRank] = await Promise.all([
                getDriverRank(targetId, 'solo'),
                getDriverRank(targetId, 'street'),
                getDriverRank(targetId, 'circuit'),
            ]);
            const embed = statsEmbed({
                title:    `📊 Race Stats — ${profile.displayName}`,
                fields: [
                    { name: '🏆 Tier',              value: profile.tier,                                        inline: true  },
                    { name: '⭐ Total Points',       value: String(profile.totalPoints),                         inline: true  },
                    { name: '📊 Solo Rank',          value: soloRank    ? `#${soloRank}`    : 'Unranked',        inline: true  },
                    { name: '🏙️ Street Points',      value: String(profile.streetPoints),                        inline: true  },
                    { name: '📊 Street Rank',        value: streetRank  ? `#${streetRank}`  : 'Unranked',        inline: true  },
                    { name: '🏁 Circuit Pts',        value: String(profile.circuitPoints),                       inline: true  },
                    { name: '📊 Circuit Rank',       value: circuitRank ? `#${circuitRank}` : 'Unranked',        inline: true  },
                    { name: '🌃 No Hesi Runs',       value: String(profile.noHesiRuns),                         inline: true  },
                    { name: '💨 Best Speed',         value: `${profile.bestNoHesiTopSpeed} mph`,                 inline: true  },
                ],
            });
            const btnRow = rows([Buttons.viewProfile(targetId), Buttons.runHistory(targetId)]);
            await interaction.editReply({ embeds: [embed], components: btnRow });
            return true;
        }

        // ── Balance button ──────────────────────────────────────────────────
        if (key === 'balance') {
            const targetId = parts[3] || interaction.user.id;
            await interaction.deferReply({ flags: 64 });
            const { getWalletSummary } = svc.economy();
            const wallet = await getWalletSummary(targetId);
            const embed = walletEmbed({
                title:  '🪙 Wallet',
                fields: [
                    { name: '💰 Balance',       value: `**${wallet.balance}** coins`,           inline: true  },
                    { name: '📈 Total Earned',  value: String(wallet.totalEarned),               inline: true  },
                    { name: '🛒 Total Spent',   value: String(wallet.totalSpent),                inline: true  },
                    { name: '🔥 Daily Streak',  value: String(wallet.dailyStreak),               inline: true  },
                ],
            });
            const btnRow = rows([Buttons.openShop(), Buttons.upgradeMenu()]);
            await interaction.editReply({ embeds: [embed], components: btnRow });
            return true;
        }

        // ── Claim-all challenges button ─────────────────────────────────────
        if (key === 'challenge_claim') {
            // parts: ['ui','challenge','claim','all']
            if (parts[3] !== 'all') return false;
            await interaction.deferReply({ flags: 64 });
            const { claimAllCompleted } = svc.challenges();
            const claimed = await claimAllCompleted(interaction.user.id);
            if (!claimed.length) {
                await interaction.editReply({ content: '⚠️ No completed challenges to claim right now.' });
                return true;
            }
            const totalCoins = claimed.reduce((s, c) => s + Number(c.rewardCoins || 0), 0);
            const totalXp    = claimed.reduce((s, c) => s + Number(c.rewardXp    || 0), 0);
            const embed = successEmbed({
                title:       '✅ Challenges Claimed',
                description: `Claimed **${claimed.length}** challenge reward${claimed.length !== 1 ? 's' : ''}.`,
                fields: [
                    { name: '🪙 Coins',  value: `+${totalCoins}`, inline: true },
                    { name: '⭐ XP',     value: `+${totalXp}`,    inline: true },
                ],
            });
            // Disable the claim-all button on the original message
            const originalComponents = interaction.message.components.map((row) => {
                const newRow = row.toJSON();
                newRow.components = newRow.components.map((b) =>
                    b.custom_id === 'ui_challenge_claim_all' ? { ...b, disabled: true } : b
                );
                return newRow;
            });
            await interaction.message.edit({ components: originalComponents }).catch(() => null);
            await interaction.editReply({ embeds: [embed] });
            return true;
        }

        // ── Open shop button ────────────────────────────────────────────────
        if (key === 'shop_open') {
            await interaction.deferReply({ flags: 64 });
            const { getShopCatalog } = svc.economy();
            const items = getShopCatalog();
            const fields = items.map((item) => ({
                name:   `${item.name}`,
                value:  `${item.description}\n🪙 **${item.price}** coins · \`/buy item:${item.id}\``,
                inline: false,
            }));
            const embed = shopEmbed({
                title:       '🛒 MIDNIGHT Shop',
                description: 'Use `/buy item:<id>` to purchase.',
                fields,
            });
            await interaction.editReply({ embeds: [embed] });
            return true;
        }

        // ── Upgrade menu button ─────────────────────────────────────────────
        if (key === 'upgrade_menu') {
            await interaction.deferReply({ flags: 64 });
            const embed = membershipEmbed({
                title:       '⬆️ Membership Upgrade',
                description: 'Choose a tier below using `/upgrade tier:<tier>`\n\n' + DIVIDER,
                fields: [
                    { name: '🥉 Bronze', value: '1.25× XP boost · 1.1× coin boost\nUse `/upgrade tier:bronze`', inline: true },
                    { name: '🥈 Silver', value: '1.5× XP boost · 1.25× coin boost\nUse `/upgrade tier:silver`', inline: true },
                    { name: '🥇 Gold',   value: '2× XP boost · 1.5× coin boost + exclusive radio\nUse `/upgrade tier:gold`', inline: true },
                ],
            });
            await interaction.editReply({ embeds: [embed] });
            return true;
        }

        // ── Event join button ───────────────────────────────────────────────
        if (key === 'event_join') {
            // Note: actual /race join handles joining — this button shows ephemeral instructions
            const eventName = parts.slice(3).join(' ');
            await interaction.reply({
                embeds: [eventEmbed({
                    title:       '🏁 Join This Event',
                    description: `Use the command below to join **${eventName || 'this event'}**:\n\n\`\`\`/race join name:${eventName || 'event-name'}\`\`\``,
                })],
                flags: 64,
            });
            return true;
        }

        // ── Event view-details button ───────────────────────────────────────
        if (key === 'event_view') {
            await interaction.deferReply({ flags: 64 });
            const { listScheduledEvents } = svc.event();
            const events = await listScheduledEvents(5);
            if (!events.length) {
                await interaction.editReply({ content: 'No upcoming events.' });
                return true;
            }
            const fields = events.map((e) => ({
                name:  `🏁 ${e.title}`,
                value: `Starts ${ts(e.startsAt, 'F')} · ${ts(e.startsAt, 'R')}${e.description ? `\n${e.description}` : ''}`,
                inline: false,
            }));
            const embed = eventEmbed({
                title:  '📋 Upcoming Events',
                fields,
            });
            await interaction.editReply({ embeds: [embed] });
            return true;
        }

        // ── Radio list button ───────────────────────────────────────────────
        if (key === 'radio_list') {
            await interaction.deferReply({ flags: 64 });
            const { buildAllStationsEmbed } = require('../music/nowPlayingService');
            const embed = await buildAllStationsEmbed();
            const btnRow = rows([Buttons.nextStation()]);
            await interaction.editReply({ embeds: [embed], components: btnRow });
            return true;
        }

        // ── Radio next-station button ───────────────────────────────────────
        if (key === 'radio_next') {
            await interaction.reply({
                content: 'Use `/radio set-station` to switch stations on the bot side. In-game press **F9**.',
                flags: 64,
            });
            return true;
        }

        // ── Leaderboard refresh button ──────────────────────────────────────
        if (key === 'leaderboard') {
            const type = parts[3] || 'street';
            await interaction.deferReply({ flags: 64 });
            const { buildLeaderboardEmbed } = require('../racing/leaderboardPoster');
            const embed = await buildLeaderboardEmbed(type, false);
            const btnRow = rows([Buttons.refreshBoard(type)]);
            await interaction.editReply({ embeds: [embed], components: btnRow });
            return true;
        }

        // ── Run history button ──────────────────────────────────────────────
        if (key === 'runs') {
            const targetId = parts[3] || interaction.user.id;
            await interaction.reply({
                content: `Run history: use \`/top type:street\` to see the leaderboard, or \`/stats user:@${interaction.user.username}\` for full stats.`,
                flags: 64,
            });
            return true;
        }

        // ── Team stats button ───────────────────────────────────────────────
        if (key === 'team_stats') {
            // customId: ui_team_stats_<encodedTeamName>  OR  ui_team_stats (own team)
            const encodedName = parts[3] || null;
            const teamName = encodedName ? decodeURIComponent(encodedName) : null;

            const { getTeamStats, getTeamRank } = svc.team();
            const DriverProfile = require('../../models/DriverProfile');

            let resolvedName = teamName;
            if (!resolvedName) {
                const profile = await DriverProfile.findOne({ discordId: interaction.user.id }).populate('teamId');
                resolvedName = profile?.teamId?.name || null;
            }

            if (!resolvedName) {
                await interaction.reply({ content: "You're not in a team. Use `/team join` to join one.", flags: 64 });
                return true;
            }

            const data = await getTeamStats(resolvedName).catch(() => null);
            if (!data) {
                await interaction.reply({ content: `Team **${resolvedName}** not found.`, flags: 64 });
                return true;
            }

            const { team, profiles } = data;
            const rank = await getTeamRank(team._id).catch(() => '?');
            const medals = ['🥇', '🥈', '🥉'];
            const memberLines = profiles.map((p, i) =>
                `${medals[i] || `**${i + 1}.**`} ${p.displayName} — ${p.totalPoints} pts · ${p.tier}`
            );

            const { teamEmbed } = require('./theme');
            const embed = teamEmbed({
                title:     `👥 Team: ${team.name}`,
                thumbnail: team.iconUrl   || undefined,
                image:     team.bannerUrl || undefined,
                fields: [
                    { name: '🏆 Total Points', value: String(team.totalPoints),          inline: true  },
                    { name: '🥇 Wins',         value: String(team.teamWins),             inline: true  },
                    { name: '📊 Rank',         value: `#${rank}`,                        inline: true  },
                    { name: '📅 Weekly Pts',   value: String(team.weeklyPoints || 0),    inline: true  },
                    { name: `👤 Roster (${profiles.length})`, value: memberLines.join('\n') || 'No members.', inline: false },
                ],
            });

            await interaction.reply({ embeds: [embed], flags: 64 });
            return true;
        }
    } catch (err) {
        console.error(`[ui button] ${interaction.customId}:`, err.message);
        const payload = { content: 'Something went wrong — please try again.', flags: 64 };
        if (interaction.deferred) await interaction.editReply(payload).catch(() => null);
        else await interaction.reply(payload).catch(() => null);
    }

    return true; // consumed
}

module.exports = { handleUiButton };
