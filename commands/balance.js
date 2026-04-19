'use strict';
const { walletEmbed, rows, Buttons } = require('../core/ui/theme');
const { getWalletSummary } = require('../core/economy/service');

module.exports = {
    data: {
        name: 'balance',
        description: 'View your current currency balance.',
        options: [
            { type: 6, name: 'user', description: 'Optional user to inspect.', required: false },
        ],
    },

    async execute(interaction) {
        const target = interaction.options.getUser('user') || interaction.user;
        const isSelf = target.id === interaction.user.id;
        await interaction.deferReply();

        const wallet = await getWalletSummary(target.id);

        const embed = walletEmbed({
            title:  `🪙 Wallet — ${target.username}`,
            fields: [
                { name: '💰 Balance',       value: `**${wallet.balance}** coins`,  inline: true },
                { name: '📈 Total Earned',  value: String(wallet.totalEarned),      inline: true },
                { name: '🛍️ Total Spent',   value: String(wallet.totalSpent),        inline: true },
                { name: '🔥 Daily Streak',  value: String(wallet.dailyStreak),      inline: true },
            ],
        });

        const btns = isSelf ? [Buttons.openShop(), Buttons.upgradeMenu()] : [];
        const components = btns.length ? rows(btns) : [];

        await interaction.editReply({ embeds: [embed], components });
    },
};
