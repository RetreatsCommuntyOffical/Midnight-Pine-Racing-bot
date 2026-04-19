'use strict';
const { statsEmbed, rows, Buttons, DIVIDER } = require('../core/ui/theme');
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
            await interaction.editReply({ content: `No stats found for <@${target.id}>. They haven't raced yet.` });
            return;
        }

        const [soloRank, streetRank, circuitRank] = await Promise.all([
            getDriverRank(target.id, 'solo'),
            getDriverRank(target.id, 'street'),
            getDriverRank(target.id, 'circuit'),
        ]);
        const teamRank = profile.teamId ? await getTeamRank(profile.teamId._id) : null;

        const cleanPct = profile.noHesiRuns > 0
            ? ((profile.cleanRuns / profile.noHesiRuns) * 100).toFixed(1) : '0.0';

        const embed = statsEmbed({
            title:       `🏁 Driver Stats — ${profile.displayName}`,
            description: DIVIDER,
            thumbnail:   target.displayAvatarURL(),
            fields: [
                { name: '🏆 Tier',           value: profile.tier,                                          inline: true },
                { name: '⭐ Total Points',    value: String(profile.totalPoints),                            inline: true },
                { name: '📊 Solo Rank',       value: soloRank    ? `#${soloRank}`    : 'Unranked',           inline: true },
                { name: '🏙️ Street Points',   value: String(profile.streetPoints),                          inline: true },
                { name: '📊 Street Rank',     value: streetRank  ? `#${streetRank}`  : 'Unranked',           inline: true },
                { name: '🏁 Circuit Pts',    value: String(profile.circuitPoints),                         inline: true },
                { name: '📊 Circuit Rank',    value: circuitRank ? `#${circuitRank}` : 'Unranked',           inline: true },
                { name: '🌃 No Hesi Runs',    value: String(profile.noHesiRuns),                            inline: true },
                { name: '✅ Clean %',         value: `${cleanPct}%`,                                        inline: true },
                { name: '💨 Best Top Speed',  value: `${profile.bestNoHesiTopSpeed} mph`,                   inline: true },
                { name: '📍 Best Distance',   value: `${profile.bestNoHesiDistance} m`,                     inline: true },
                { name: '🔥 No-Crash Streak', value: String(profile.noCrashStreak),                          inline: true },
                ...(profile.teamId ? [{ name: '👥 Team', value: `${profile.teamId.name} (Rank #${teamRank})`, inline: false }] : []),
            ],
        });

        const btns = [Buttons.viewProfile(target.id), Buttons.runHistory(target.id)];
        if (target.id === interaction.user.id) btns.push(Buttons.viewBalance(target.id));

        await interaction.editReply({ embeds: [embed], components: rows(btns) });
    },
};
