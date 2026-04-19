'use strict';
const { membershipEmbed, successEmbed, rows, Buttons, ts } = require('../core/ui/theme');
const { PermissionFlagsBits } = require('discord.js');
const { getMembership, syncMembership } = require('../core/membership/service');

const TIER_ICONS = { none: '⚫', bronze: '🥉', silver: '🥈', gold: '🥇' };

module.exports = {
    data: {
        name: 'member',
        description: 'Membership status and sync controls.',
        options: [
            {
                type: 1,
                name: 'status',
                description: 'View your membership status.',
                options: [
                    { type: 6, name: 'user', description: 'Optional user', required: false },
                ],
            },
            {
                type: 1,
                name: 'sync',
                description: 'Staff: manually sync membership tier/expiry.',
                options: [
                    { type: 6, name: 'user', description: 'Target user', required: true },
                    {
                        type: 3,
                        name: 'tier',
                        description: 'Membership tier',
                        required: true,
                        choices: [
                            { name: 'none',   value: 'none'   },
                            { name: 'bronze', value: 'bronze' },
                            { name: 'silver', value: 'silver' },
                            { name: 'gold',   value: 'gold'   },
                        ],
                    },
                    { type: 3, name: 'expires_at', description: 'ISO date/time', required: true },
                ],
            },
        ],
    },

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'status') {
            const target     = interaction.options.getUser('user') || interaction.user;
            const membership = await getMembership(target.id);
            const icon       = TIER_ICONS[membership.tier] || '⚫';

            const embed = membershipEmbed({
                title:  `${icon} Membership — ${target.username}`,
                thumbnail: target.displayAvatarURL(),
                fields: [
                    { name: '🏅 Tier',       value: (membership.tier || 'none').toUpperCase(), inline: true },
                    { name: '✅ Active',      value: membership.active ? 'Yes' : 'No',          inline: true },
                    { name: '📅 Expires',     value: membership.expiresAt ? ts(membership.expiresAt, 'D') : 'N/A', inline: true },
                    { name: '⚡ XP Boost',   value: `${membership.xpBoostMultiplier || 1}x`,   inline: true },
                    { name: '💨 Drift Boost', value: `${membership.driftBoostMultiplier || 1}x`, inline: true },
                ],
            });

            const isSelf     = target.id === interaction.user.id;
            const components = isSelf ? rows([Buttons.upgradeMenu(), Buttons.openShop()]) : [];
            await interaction.reply({ embeds: [embed], components });
            return;
        }

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({ content: 'Staff only.', flags: 64 });
            return;
        }

        try {
            const user      = interaction.options.getUser('user', true);
            const tier      = interaction.options.getString('tier', true);
            const expiresAt = interaction.options.getString('expires_at', true);
            const row       = await syncMembership({
                discordId:   user.id,
                tier,
                expiresAt,
                source:      'discord_staff_sync',
                purchaseRef: `manual-${Date.now()}`,
            });
            const icon  = TIER_ICONS[row.tier] || '⚫';
            const embed = successEmbed({
                title:       `${icon} Membership Synced`,
                description: `<@${user.id}> updated to **${row.tier.toUpperCase()}**.`,
                fields: [
                    { name: '✅ Active',  value: row.active ? 'Yes' : 'No',                                     inline: true },
                    { name: '📅 Expires', value: row.expiresAt ? ts(row.expiresAt, 'D') : 'N/A',               inline: true },
                ],
            });
            await interaction.reply({ embeds: [embed] });
        } catch (err) {
            await interaction.reply({ content: err.message || 'Membership sync failed.', flags: 64 });
        }
    },
};
