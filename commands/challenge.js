'use strict';
const { challengeEmbed, successEmbed, rows, Buttons, DIVIDER } = require('../core/ui/theme');
const {
    getActiveChallenges,
    claimChallenge,
    claimAllCompleted,
} = require('../core/challenges/service');

module.exports = {
    data: {
        name: 'challenge',
        description: 'Daily and weekly challenge tracking.',
        options: [
            { type: 1, name: 'list', description: 'List your active challenges.' },
            {
                type: 1,
                name: 'claim',
                description: 'Claim a completed challenge reward.',
                options: [
                    { type: 3, name: 'id', description: 'Challenge progress ID from /challenge list', required: true },
                ],
            },
            { type: 1, name: 'claim-all', description: 'Claim all completed challenges.' },
        ],
    },

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const PERIOD_ICONS = { daily: '🗓️', weekly: '📅' };

        try {
            if (sub === 'list') {
                const data = await getActiveChallenges(interaction.user.id);
                if (!data.length) {
                    await interaction.reply({
                        embeds: [challengeEmbed({
                            title:       '🎯 No Active Challenges',
                            description: 'Check back soon for new daily and weekly challenges!',
                        })],
                        flags: 64,
                    });
                    return;
                }

                const fields = data.map((row) => {
                    const icon       = PERIOD_ICONS[row.period] || '🎯';
                    const statusStr  = row.claimed ? 'CLAIMED' : row.completed ? 'COMPLETE' : `${row.progress}/${row.target}`;
                    const statusIcon = row.claimed ? '✅' : row.completed ? '🟢' : '⚪️';
                    return {
                        name:  `${icon} ${row.challengeKey}`,
                        value: `${statusIcon} **${statusStr}** · 🪙 ${row.rewardCoins} coins · ⭐ ${row.rewardXp} XP\n\`ID: ${row._id}\``,
                        inline: false,
                    };
                });

                const hasComplete = data.some((r) => r.completed && !r.claimed);
                const embed = challengeEmbed({
                    title:       '🎯 Challenge Tracker',
                    description: DIVIDER,
                    fields,
                    footer: 'Daily resets at midnight UTC',
                });

                const components = hasComplete ? rows([Buttons.claimAll()]) : [];
                await interaction.reply({ embeds: [embed], components });
                return;
            }

            if (sub === 'claim') {
                const id  = interaction.options.getString('id', true);
                const row = await claimChallenge({ discordId: interaction.user.id, challengeProgressId: id });
                const embed = successEmbed({
                    title:       '✅ Reward Claimed',
                    description: `**${row.challengeKey}** completed!`,
                    fields: [
                        { name: '🪙 Coins', value: `+${row.rewardCoins}`, inline: true },
                        { name: '⭐ XP',    value: `+${row.rewardXp}`,    inline: true },
                    ],
                });
                await interaction.reply({ embeds: [embed] });
                return;
            }

            if (sub === 'claim-all') {
                const claimed = await claimAllCompleted(interaction.user.id);
                if (!claimed.length) {
                    await interaction.reply({ content: '⚠️ No completed challenges to claim.', flags: 64 });
                    return;
                }
                const totalCoins = claimed.reduce((s, c) => s + Number(c.rewardCoins || 0), 0);
                const totalXp    = claimed.reduce((s, c) => s + Number(c.rewardXp    || 0), 0);
                const embed = successEmbed({
                    title:       '✅ Challenges Claimed',
                    description: `Claimed **${claimed.length}** reward${claimed.length !== 1 ? 's' : ''}.`,
                    fields: [
                        { name: '🪙 Coins', value: `+${totalCoins}`, inline: true },
                        { name: '⭐ XP',    value: `+${totalXp}`,    inline: true },
                    ],
                });
                await interaction.reply({ embeds: [embed] });
            }
        } catch (err) {
            await interaction.reply({ content: err.message || 'Challenge command failed.', flags: 64 });
        }
    },
};
