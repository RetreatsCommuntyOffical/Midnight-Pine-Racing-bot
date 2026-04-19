'use strict';
const { profileEmbed, rows, Buttons, DIVIDER, xpBar } = require('../core/ui/theme');
const { getDriverStats, getDriverRank } = require('../core/racing/service');
const { getWalletSummary } = require('../core/economy/service');
const { xpRequiredForLevel } = require('../core/progression/service');

module.exports = {
    data: {
        name: 'profile',
        description: 'View your full racing profile.',
        options: [
            { type: 6, name: 'user', description: 'Driver to inspect.', required: false },
        ],
    },

    async execute(interaction) {
        const target = interaction.options.getUser('user') || interaction.user;
        const isSelf = target.id === interaction.user.id;
        await interaction.deferReply();

        const profile = await getDriverStats(target.id);
        if (!profile) {
            await interaction.editReply({ content: `No profile found for <@${target.id}> — they haven't raced yet.` });
            return;
        }

        const wallet    = await getWalletSummary(target.id);
        const soloRank  = await getDriverRank(target.id, 'solo');
        const required  = xpRequiredForLevel(profile.level || 1);
        const bar       = xpBar(profile.xp || 0, required);
        const cleanPct  = profile.noHesiRuns > 0
            ? ((profile.cleanRuns / profile.noHesiRuns) * 100).toFixed(1) : '0.0';

        const embed = profileEmbed({
            title:       `🏁 ${profile.displayName}`,
            description: `Level **${profile.level || 1}** · Tier **${profile.tier || 'Rookie'}**\n\n${DIVIDER}`,
            thumbnail:   target.displayAvatarURL(),
            fields: [
                { name: '⭐ XP Progress',     value: bar,                                             inline: false },
                { name: '🏆 Total Points',    value: String(profile.totalPoints || 0),                inline: true  },
                { name: '📊 Solo Rank',       value: soloRank ? `#${soloRank}` : 'Unranked',          inline: true  },
                { name: '🪙 Coins',            value: String(wallet.balance),                          inline: true  },
                { name: '🌃 Runs',             value: String(profile.noHesiRuns || 0),                 inline: true  },
                { name: '💨 Best Speed',       value: `${profile.bestNoHesiTopSpeed || 0} mph`,        inline: true  },
                { name: '✅ Clean %',          value: `${cleanPct}%`,                                  inline: true  },
                ...(profile.teamId ? [{ name: '👥 Team', value: profile.teamId.name, inline: true }] : []),
            ],
        });

        const btns = [Buttons.viewStats(target.id)];
        if (isSelf) {
            btns.push(Buttons.viewBalance(target.id), Buttons.openShop());
        }

        await interaction.editReply({ embeds: [embed], components: rows(btns) });
    },
};

