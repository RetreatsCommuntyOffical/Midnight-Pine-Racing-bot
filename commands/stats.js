const { EmbedBuilder } = require('discord.js');
const { getDriverStats, getDriverRank, getTeamRank } = require('../core/racing/service');

module.exports = {
    data: {
        name: 'stats',
        description: 'View driver stats and rank.',
        options: [
            { type: 6, name: 'user', description: 'Driver to look up (defaults to you).', required: false },
        ],
    },

    async execute(interaction) {
        const target = interaction.options.getUser('user') || interaction.user;
        await interaction.deferReply();

        const profile = await getDriverStats(target.id);
        if (!profile) {
            await interaction.editReply(`No stats found for <@${target.id}>. They haven't raced yet.`);
            return;
        }

        const soloRank    = await getDriverRank(target.id, 'solo');
        const streetRank  = await getDriverRank(target.id, 'street');
        const circuitRank = await getDriverRank(target.id, 'circuit');
        const teamRank    = profile.teamId ? await getTeamRank(profile.teamId._id) : null;

        const cleanPct = profile.noHesiRuns > 0
            ? ((profile.cleanRuns / profile.noHesiRuns) * 100).toFixed(1)
            : '0.0';

        const embed = new EmbedBuilder()
            .setColor(0x4a235a)
            .setTitle(`🏁 Driver Stats — ${profile.displayName}`)
            .setThumbnail(target.displayAvatarURL())
            .addFields(
                { name: '🏆 Tier',           value: profile.tier,                                inline: true },
                { name: '⭐ Total Points',    value: String(profile.totalPoints),                  inline: true },
                { name: '📊 Solo Rank',       value: `#${soloRank}`,                              inline: true },
                { name: '🏙️ Street Points',   value: String(profile.streetPoints),                 inline: true },
                { name: '📊 Street Rank',     value: `#${streetRank}`,                            inline: true },
                { name: '🏁 Circuit Points',  value: String(profile.circuitPoints),                inline: true },
                { name: '📊 Circuit Rank',    value: `#${circuitRank}`,                           inline: true },
                { name: '🌃 No Hesi Runs',    value: String(profile.noHesiRuns),                   inline: true },
                { name: '✅ Clean %',         value: `${cleanPct}%`,                              inline: true },
                { name: '💨 Best Top Speed',  value: `${profile.bestNoHesiTopSpeed} mph`,          inline: true },
                { name: '📏 Best Distance',   value: `${profile.bestNoHesiDistance} m`,            inline: true },
                { name: '🔥 No-Crash Streak', value: String(profile.noCrashStreak),                inline: true },
                ...(profile.teamId ? [{ name: '👥 Team', value: `${profile.teamId.name} (Rank #${teamRank})`, inline: false }] : [])
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
