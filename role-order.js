/**
 * role-order.js
 * Creates the 🔱 Owner role, assigns it to the guild owner,
 * then sets the full role hierarchy from top to bottom.
 */

require('dotenv').config({ path: __dirname + '/.env' });
const { Client, GatewayIntentBits } = require('./node_modules/discord.js');

// Desired order — index 0 = highest in Discord (just below bot role)
// hoist: true  → shows as its own group in the member sidebar
// hoist: false → hidden from sidebar (ping-only / cosmetic roles)
const ROLE_ORDER = [
    // ── Staff hierarchy (always hoisted, visible in sidebar) ──
    { name: '🔱 Owner',          hoist: true  },
    { name: '👑 Admin',          hoist: true  },
    { name: '🔧 Staff',          hoist: true  },
    { name: '🛡️ Moderator',      hoist: true  },
    { name: '🎙️ Host',           hoist: true  },
    // ── Competitive rank tiers (hoisted — shown in member list) ──
    { name: '🏆 Champion',       hoist: true  },
    { name: '⚡ Elite',           hoist: true  },
    { name: '🔵 Pro',            hoist: true  },
    { name: '🟢 Rookie',         hoist: true  },
    // ── Achievement badges (NOT hoisted — cosmetic/ping only) ──
    { name: '💎 Season MVP',     hoist: false },
    { name: '🔥 Top Speed King', hoist: false },
    { name: '💯 Clean Driver',   hoist: false },
    { name: '🌟 Veteran',        hoist: false },
    { name: '⚡ Streak Champion', hoist: false },
    // ── Division / announcement ping roles (NOT hoisted) ──
    { name: '🏎️ Street Driver',  hoist: false },
    { name: '🏁 Circuit Driver', hoist: false },
    { name: '🚦 Racer',          hoist: false },
    // ── Program roles (NOT hoisted — ping targets only) ──
    { name: '🧪 Tester',         hoist: false },
    { name: '🎥 Content Creator',hoist: false },
    { name: '🤝 Partner',         hoist: false },
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
    const guild = client.guilds.cache.get(process.env.HOME_GUILD_ID);
    if (!guild) { console.error('Guild not found'); process.exit(1); }

    await guild.roles.fetch();
    await guild.members.fetch(guild.ownerId).catch(() => null);

    // 1. Create Owner role if missing
    let ownerRole = guild.roles.cache.find(r => r.name === '🔱 Owner');
    if (!ownerRole) {
        ownerRole = await guild.roles.create({
            name:  '🔱 Owner',
            color: 0xffd700,
            hoist: true,
        });
        console.log('  + Created role: 🔱 Owner');
    } else {
        console.log('  ~ Owner role already exists');
    }

    // 2. Assign Owner role to the guild owner
    const ownerMember = guild.members.cache.get(guild.ownerId);
    if (ownerMember && !ownerMember.roles.cache.has(ownerRole.id)) {
        await ownerMember.roles.add(ownerRole);
        console.log(`  + Assigned 🔱 Owner to ${ownerMember.user.tag}`);
    } else if (ownerMember) {
        console.log(`  ~ ${ownerMember.user.tag} already has 🔱 Owner`);
    }

    // 3. Build position map — highest index in ROLE_ORDER = lowest position number
    // Discord positions: higher number = higher in the list
    // Bot can only manage roles strictly BELOW its own highest role
    await guild.members.fetch(client.user.id).catch(() => null);
    const botMember = guild.members.cache.get(client.user.id);
    const botHighest = botMember?.roles.highest;
    const ceiling = botHighest ? botHighest.position - 1 : 0;

    if (ceiling <= 0) {
        console.error('');
        console.error('⚠️  The bot role has no room to reorder other roles.');
        console.error('   ➜ Go to Server Settings → Roles → drag the');
        console.error('     "Midnight Pine Racing" bot role to the VERY TOP.');
        console.error('   Then re-run: node role-order.js');
        process.exit(1);
    }

    await guild.roles.fetch();

    const positionUpdates = [];
    const unreachable = [];
    const total = ROLE_ORDER.length;

    for (let i = 0; i < total; i++) {
        const { name: roleName, hoist } = ROLE_ORDER[i];
        const role = guild.roles.cache.find(r => r.name === roleName);
        if (!role) { console.warn(`  ! Role not found, skipping: ${roleName}`); continue; }
        if (role.position >= botHighest.position) {
            unreachable.push(roleName);
            continue;
        }
        const targetPosition = Math.max(1, ceiling - i);
        positionUpdates.push({ role: role.id, position: targetPosition, hoist });
    }

    if (unreachable.length > 0) {
        console.warn('');
        console.warn('⚠️  These roles are ABOVE the bot and cannot be moved automatically:');
        unreachable.forEach(n => console.warn(`   • ${n}`));
        console.warn('');
        console.warn('   ➜ Fix: Go to Server Settings → Roles → drag the');
        console.warn('     "Midnight Pine Racing" bot role to the VERY TOP,');
        console.warn('     then re-run: node role-order.js');
    }

    // Move roles one at a time, bottom-up, to avoid intermediate conflicts
    // Sort by target position ascending so we don't displace roles we haven't moved yet
    positionUpdates.sort((a, b) => a.position - b.position);

    let moved = 0, failed = 0;
    for (const { role: roleId, position, hoist } of positionUpdates) {
        const role = guild.roles.cache.get(roleId);
        if (!role) continue;
        try {
            await role.edit({ position, hoist });
            moved++;
        } catch (e) {
            console.warn(`  ! Could not update ${role.name}: ${e.message}`);
            failed++;
        }
    }

    console.log('');
    if (unreachable.length > 0) {
        console.warn('⚠️  Roles skipped (above bot — drag the bot role higher and re-run):');
        unreachable.forEach(n => console.warn(`   • ${n}`));
        console.warn('');
    }
    console.log(`✅ Role hierarchy applied — ${moved} moved, ${failed} failed, ${unreachable.length} skipped`);
    console.log('');
    console.log('Final order (top → bottom):');
    ROLE_ORDER.forEach(({ name, hoist }, i) => {
        const hoistTag = hoist ? ' [sidebar]' : ' [ping-only]';
        const skip = unreachable.includes(name) ? ' ⚠️  (above bot — move manually)' : '';
        console.log(`  ${String(i + 1).padStart(2, ' ')}. ${name}${hoistTag}${skip}`);
    });
    process.exit(0);
});

client.login(process.env.BOT_TOKEN);
