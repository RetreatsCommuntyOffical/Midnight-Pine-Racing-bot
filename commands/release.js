const { PermissionFlagsBits } = require('discord.js');
const { createRelease, postRelease, listScheduledReleases } = require('../core/racing/releaseService');

function parseChanges(raw) {
    if (!raw) return [];
    return raw.split('|').map((section) => {
        const [cat, ...rest] = section.split(':');
        return { category: cat.trim(), items: rest.join(':').split(',').map((s) => s.trim()).filter(Boolean) };
    });
}

module.exports = {
    data: {
        name: 'release',
        description: 'Midnight Pine Racing content drop system (staff only).',
        options: [
            {
                type: 1, name: 'map', description: 'Post or schedule a map drop.',
                options: [
                    { type: 3, name: 'title',       description: 'Map name.',                          required: true  },
                    { type: 3, name: 'description',  description: 'Short description.',                required: false },
                    { type: 3, name: 'image_url',    description: 'Map image URL.',                    required: false },
                    { type: 3, name: 'map_type',     description: 'e.g. Street Highway, Circuit.',     required: false },
                    { type: 3, name: 'environment',  description: 'e.g. Night / City, Mountain.',      required: false },
                    { type: 3, name: 'difficulty',   description: 'e.g. High Speed, Expert.',          required: false },
                    { type: 8, name: 'ping_role',    description: 'Role to ping on drop.',             required: false },
                    { type: 3, name: 'schedule_iso', description: 'ISO datetime to auto-post.',        required: false },
                ],
            },
            {
                type: 1, name: 'vehicle', description: 'Post or schedule a vehicle drop.',
                options: [
                    { type: 3, name: 'title',           description: 'Vehicle name.',                  required: true  },
                    { type: 3, name: 'description',      description: 'Short description.',             required: false },
                    { type: 3, name: 'image_url',        description: 'Vehicle image URL.',             required: false },
                    { type: 3, name: 'vehicle_class',    description: 'e.g. Performance, Muscle.',     required: false },
                    { type: 3, name: 'top_speed',        description: 'e.g. 210 MPH.',                 required: false },
                    { type: 3, name: 'handling',         description: 'e.g. Precision, Drift.',        required: false },
                    { type: 3, name: 'vehicle_category', description: 'e.g. Street, Track.',           required: false },
                    { type: 8, name: 'ping_role',        description: 'Role to ping on drop.',         required: false },
                    { type: 3, name: 'schedule_iso',     description: 'ISO datetime to auto-post.',    required: false },
                ],
            },
            {
                type: 1, name: 'update', description: 'Post or schedule a patch/update log.',
                options: [
                    { type: 3, name: 'version', description: 'Version tag, e.g. v1.2.',                required: true  },
                    { type: 3, name: 'changes',  description: '"Category: item, item | Category: item"', required: true  },
                    { type: 3, name: 'image_url', description: 'Optional banner image URL.',            required: false },
                    { type: 8, name: 'ping_role', description: 'Role to ping.',                        required: false },
                    { type: 3, name: 'schedule_iso', description: 'ISO datetime to auto-post.',        required: false },
                ],
            },
            {
                type: 1, name: 'sneak', description: 'Post a sneak peek / hype teaser.',
                options: [
                    { type: 3, name: 'description',  description: 'Hype text.',             required: false },
                    { type: 3, name: 'image_url',    description: 'Teaser image URL.',      required: false },
                    { type: 8, name: 'ping_role',    description: 'Role to ping.',          required: false },
                    { type: 3, name: 'schedule_iso', description: 'ISO datetime to auto-post.', required: false },
                ],
            },
            { type: 1, name: 'list', description: 'List upcoming scheduled releases.' },
            {
                type: 1, name: 'post', description: 'Immediately post a draft/scheduled release by ID.',
                options: [{ type: 3, name: 'release_id', description: 'Release MongoDB ID.', required: true }],
            },
        ],
    },

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({ content: 'Staff only.', ephemeral: true });
            return;
        }

        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'list') {
                const releases = await listScheduledReleases(15);
                if (!releases.length) { await interaction.reply('No scheduled releases.'); return; }
                const lines = releases.map((r) => {
                    const ts = r.scheduledFor ? `<t:${Math.floor(new Date(r.scheduledFor).getTime() / 1000)}:R>` : 'draft';
                    return `\`${r._id}\` [${r.type.toUpperCase()}] **${r.title}** — ${ts}`;
                });
                await interaction.reply({ content: lines.join('\n'), ephemeral: true });
                return;
            }

            if (sub === 'post') {
                const Release = require('../models/Release');
                const id = interaction.options.getString('release_id', true);
                const release = await Release.findById(id).catch(() => null);
                if (!release) { await interaction.reply({ content: 'Release not found.', ephemeral: true }); return; }
                await interaction.deferReply({ ephemeral: true });
                const msg = await postRelease(interaction.client, interaction.guild, release);
                await interaction.editReply(msg ? `✅ Posted in <#${msg.channelId}>.` : '⚠️ Channel not found — run /setup-midnight-pine first.');
                return;
            }

            const scheduleIso = interaction.options.getString('schedule_iso');
            const imageUrl    = interaction.options.getString('image_url');
            const pingRole    = interaction.options.getRole('ping_role');
            const description = interaction.options.getString('description');

            const releaseData = {
                type:              sub,
                title:             '',
                description,
                imageUrl,
                pingRoleId:        pingRole?.id || null,
                scheduleIso,
                createdByDiscordId: interaction.user.id,
            };

            if (sub === 'map') {
                releaseData.title       = interaction.options.getString('title', true);
                releaseData.mapType     = interaction.options.getString('map_type');
                releaseData.environment = interaction.options.getString('environment');
                releaseData.difficulty  = interaction.options.getString('difficulty');
            }
            if (sub === 'vehicle') {
                releaseData.title           = interaction.options.getString('title', true);
                releaseData.vehicleClass    = interaction.options.getString('vehicle_class');
                releaseData.topSpeed        = interaction.options.getString('top_speed');
                releaseData.handling        = interaction.options.getString('handling');
                releaseData.vehicleCategory = interaction.options.getString('vehicle_category');
            }
            if (sub === 'update') {
                releaseData.version = interaction.options.getString('version', true);
                releaseData.title   = `Update ${releaseData.version}`;
                releaseData.changes = parseChanges(interaction.options.getString('changes', true));
            }
            if (sub === 'sneak') {
                releaseData.title = 'Incoming Drop';
            }

            const release = await createRelease(releaseData);

            if (!scheduleIso) {
                await interaction.deferReply({ ephemeral: true });
                const msg = await postRelease(interaction.client, interaction.guild, release);
                await interaction.editReply(msg ? `✅ Drop posted in <#${msg.channelId}>.` : '⚠️ Channel not found — run /setup-midnight-pine first.');
                return;
            }

            const ts = Math.floor(new Date(scheduleIso).getTime() / 1000);
            await interaction.reply({ content: `📅 **${release.title}** drops <t:${ts}:R> (ID: \`${release._id}\`).`, ephemeral: true });
        } catch (err) {
            const payload = { content: err.message || 'An error occurred.', ephemeral: true };
            if (interaction.deferred) await interaction.editReply(payload);
            else await interaction.reply(payload);
        }
    },
};
