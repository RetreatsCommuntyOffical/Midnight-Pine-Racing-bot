/**
 * Binary-search bisect to find which slash command(s) cause Discord
 * guild command registration to hang or fail.
 *
 * Usage: node bisect-commands.js
 *
 * It repeatedly registers subsets of the command list using a 12-second
 * timeout per attempt, then subdivides whichever range fails until it
 * isolates the individual offending command(s).
 */

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const BOT_TOKEN     = String(process.env.BOT_TOKEN     || '').trim();
const CLIENT_ID     = String(process.env.CLIENT_ID     || '').trim();
const HOME_GUILD_ID = String(process.env.HOME_GUILD_ID || '').trim();

if (!BOT_TOKEN || !CLIENT_ID || !HOME_GUILD_ID) {
    console.error('Missing BOT_TOKEN, CLIENT_ID, or HOME_GUILD_ID in .env');
    process.exit(1);
}

// ── Load all commands ──────────────────────────────────────────────────────
const cmdDir = path.join(__dirname, 'commands');
const allCommands = fs
    .readdirSync(cmdDir)
    .filter((f) => f.endsWith('.js'))
    .map((file) => {
        const mod = require(path.join(cmdDir, file));
        if (!mod?.data?.name) return null;
        const data = typeof mod.data.toJSON === 'function' ? mod.data.toJSON() : mod.data;
        return { name: mod.data.name, file, data };
    })
    .filter(Boolean);

console.log(`Loaded ${allCommands.length} command(s).\n`);

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
const ATTEMPT_TIMEOUT_MS = 12_000;

/** Try registering a subset. Returns true on success, false on failure/timeout. */
async function tryRegister(subset, label) {
    const body = subset.map((c) => c.data);
    const names = subset.map((c) => c.name).join(', ');
    process.stdout.write(`  [${label}] Testing ${subset.length} cmd(s): ${names} ... `);

    const timeoutP = new Promise((_, rej) =>
        setTimeout(() => rej(new Error('TIMEOUT')), ATTEMPT_TIMEOUT_MS)
    );

    try {
        const res = await Promise.race([
            rest.put(Routes.applicationGuildCommands(CLIENT_ID, HOME_GUILD_ID), { body }),
            timeoutP,
        ]);
        console.log(`✅ OK (${res.length} registered)`);
        return true;
    } catch (err) {
        console.log(`❌ FAIL — ${err.message}`);
        return false;
    }
}

/** Recursive binary bisect over an array of commands. */
async function bisect(commands, depth = 0) {
    if (commands.length === 0) return [];
    const label = `depth=${depth} n=${commands.length}`;

    const ok = await tryRegister(commands, label);
    if (ok) return []; // this entire subset is fine

    if (commands.length === 1) {
        console.log(`\n🔴 OFFENDING COMMAND FOUND: "${commands[0].name}" (${commands[0].file})\n`);
        return [commands[0]];
    }

    const mid  = Math.ceil(commands.length / 2);
    const left  = commands.slice(0, mid);
    const right = commands.slice(mid);

    // Test each half separately so we don't miss multiple bad commands.
    const badLeft  = await bisect(left,  depth + 1);
    const badRight = await bisect(right, depth + 1);
    return [...badLeft, ...badRight];
}

(async () => {
    console.log('── Starting bisect ──────────────────────────────────────────\n');
    const bad = await bisect(allCommands);

    console.log('\n── Bisect complete ──────────────────────────────────────────');
    if (bad.length === 0) {
        console.log('✅ No offending commands found — full set registered successfully.');
    } else {
        console.log(`\n🔴 ${bad.length} offending command(s):`);
        for (const c of bad) console.log(`   • ${c.name}  (${c.file})`);

        // Print the serialised data of each bad command for inspection.
        console.log('\n── Serialised data of offending command(s) ─────────────────');
        for (const c of bad) {
            console.log(`\n${c.name}:`);
            try { console.log(JSON.stringify(c.data, null, 2)); }
            catch (e) { console.log('  <not serialisable:', e.message, '>'); }
        }
    }

    // Clear guild commands so we leave the server in a clean state.
    console.log('\n── Clearing guild commands (cleanup) ────────────────────────');
    await rest
        .put(Routes.applicationGuildCommands(CLIENT_ID, HOME_GUILD_ID), { body: [] })
        .then(() => console.log('Guild commands cleared.'))
        .catch((e) => console.warn('Cleanup failed:', e.message));

    process.exit(bad.length > 0 ? 1 : 0);
})();
