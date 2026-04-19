'use strict';
const { shopEmbed, rows, btn } = require('../core/ui/theme');
const { getShopCatalog } = require('../core/economy/service');

module.exports = {
    data: {
        name: 'shop',
        description: 'Browse and buy from the MIDNIGHT Shop.',
    },

    async execute(interaction) {
        const items = getShopCatalog();
        const fields = items.map((item) => ({
            name:  `${item.name}`,
            value: `${item.description}\n\uD83E\uDE99 **${item.price}** coins \u00b7 \`/buy item:${item.id}\``,
            inline: false,
        }));

        const embed = shopEmbed({
            title:       '\uD83D\uDECD\uFE0F MIDNIGHT Shop',
            description: 'Spend your coins on upgrades and perks.\n\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014',
            fields: fields.length ? fields : [{ name: 'Coming Soon', value: 'No items available yet.', inline: false }],
            footer:  'Use /buy item:<id> to purchase',
        });

        const btns = items.slice(0, 4).map((item) =>
            btn({ id: `buy_quick_${item.id}`, label: item.name, style: 'Primary', emoji: '\uD83D\uDECD\uFE0F' })
        );
        btns.push(btn({ id: 'ui_balance', label: 'My Wallet', style: 'Secondary', emoji: '\uD83E\uDE99' }));

        await interaction.reply({ embeds: [embed], components: rows(btns) });
    },
};

