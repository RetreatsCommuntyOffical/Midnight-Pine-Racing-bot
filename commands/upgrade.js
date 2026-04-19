'use strict';
const { membershipEmbed, successEmbed, rows, Buttons, ts } = require('../core/ui/theme');
const { upgradeMembership } = require('../core/membership/service');

const TIER_ICONS = { bronze: '🥉', silver: '🥈', gold: '🥇' };

module.exports = {
    data: {
        name: 'upgrade',
        description: 'Upgrade your membership tier using in-bot currency.',
        options: [
            {
                type: 3,
                name: 'tier',
                description: 'Tier to upgrade to',
                required: true,
                choices: [
                    { name: 'bronze', value: 'bronze' },
                    { name: 'silver', value: 'silver' },
                    { name: 'gold',   value: 'gold'   },
                ],
            },
            { type: 4, name: 'months', description: 'Number of months (default 1)', required: false, min_value: 1, max_value: 12 },
        ],
    },

    async execute(interaction) {
        try {
            const tier       = interaction.options.getString('tier', true);
            const months     = interaction.options.getInteger('months') || 1;
            const membership = await upgradeMembership({
                discordId: interaction.user.id,
                tier,
                months,
            });

            const icon = TIER_ICONS[tier] || '⭐';
            const embed = successEmbed({
                title:       `${icon} Membership Upgraded`,
                description: `You are now **${membership.tier.toUpperCase()}** tier.`,
                fields: [
                    { name: '⚡ XP Boost',    value: `${membership.xpBoostMultiplier}x`,    inline: true },
                    { name: '💨 Drift Boost', value: `${membership.driftBoostMultiplier}x`, inline: true },
                    { name: '📅 Expires',     value: membership.expiresAt ? ts(membership.expiresAt, 'D') : 'Never', inline: true },
                ],
            });

            await interaction.reply({
                embeds:     [embed],
                components: rows([Buttons.viewBalance(interaction.user.id), Buttons.openShop()]),
            });
        } catch (err) {
            await interaction.reply({ content: err.message || 'Upgrade failed.', flags: 64 });
        }
    },
};
