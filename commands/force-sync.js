const { PermissionFlagsBits } = require('discord.js');
const { loadCommands, registerCommands } = require('../core/commandHandler');

module.exports = {
    data: {
        name: 'force-sync',
        description: 'Force refresh all bot slash commands in Discord.',
        defaultMemberPermissions: String(PermissionFlagsBits.Administrator),
    },

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator only.', flags: 64 });
            return;
        }

        await interaction.deferReply({ flags: 64 });

        const commands = loadCommands();
        await registerCommands(commands);

        await interaction.editReply(`✅ Force sync complete. Registered **${commands.size}** commands to Discord.`);
    },
};
