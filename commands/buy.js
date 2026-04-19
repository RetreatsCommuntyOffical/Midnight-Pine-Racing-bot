'use strict';
const { successEmbed, rows, Buttons } = require('../core/ui/theme');
const { buyShopItem } = require('../core/economy/service');

module.exports = {
    data: {
        name: 'buy',
        description: 'Buy an item from the shop.',
        options: [
            { type: 3, name: 'item', description: 'Item ID from /shop.', required: true },
        ],
    },

    async execute(interaction) {
        const itemId = interaction.options.getString('item', true);
        try {
            const result = await buyShopItem({ discordId: interaction.user.id, itemId });
            const embed = successEmbed({
                title:       '\uD83D\uDECD\uFE0F Purchase Complete',
                description: `You bought **${result.item.name}**.`,
                fields: [
                    { name: '\uD83D\uDCB0 Price',       value: `${result.item.price} coins`,  inline: true },
                    { name: '\uD83E\uDE99 New Balance', value: `${result.balanceAfter} coins`, inline: true },
                ],
            });
            await interaction.reply({
                embeds:     [embed],
                components: rows([Buttons.openShop(), Buttons.viewBalance(interaction.user.id)]),
            });
        } catch (err) {
            await interaction.reply({ content: err.message || 'Purchase failed.', flags: 64 });
        }
    },
};

