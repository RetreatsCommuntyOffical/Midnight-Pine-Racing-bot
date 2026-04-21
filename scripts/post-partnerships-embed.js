require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const CHANNEL_ID = '1495945304032415897';

const DESCRIPTION = [
  '━━━━━━━━━━━━━━━━━━━━━━',
  '🌑 **SHADOWS OF RUIN — OFFICIAL PARTNERSHIPS**',
  '',
  "We're expanding the network. Shadows of Ruin is now connected with communities that bring **growth, tech, and real support**.",
  '',
  '━━━━━━━━━━━━━━━━━━━━━━',
  '🛠️ **TRH DEVELOPMENT**',
  'Build, create, and connect with developers pushing real projects forward.',
  '🔗 https://discord.gg/KcV57EFfqE',
  '',
  '━━━━━━━━━━━━━━━━━━━━━━',
  '🧠 **THE UNSTABLE TABLE**',
  'A mental health–focused space to talk, vent, and get support when you need it. No judgment, just real people.',
  '🔗 https://discord.gg/86bzch9sP5',
  '',
  '━━━━━━━━━━━━━━━━━━━━━━',
  '💻 **DPN TECHNOLOGY**',
  'Tech-focused community for development, innovation, and leveling up your digital skills.',
  '🔗 https://discord.gg/YZETcMm5k6',
  '',
  '━━━━━━━━━━━━━━━━━━━━━━',
  '⚔️ **WHAT THIS MEANS**',
  '• Stronger community connections',
  '• More opportunities to grow',
  '• A network that supports both the grind and the person behind it',
  '',
  '━━━━━━━━━━━━━━━━━━━━━━',
  '📢 Tap in, join up, and be part of something bigger than just one server.',
  '',
  'Welcome to the network.',
  '━━━━━━━━━━━━━━━━━━━━━━',
].join('\n');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    console.log(`Posting to #${channel.name}`);

    const embed = new EmbedBuilder()
      .setColor(0x1a1a2e)
      .setDescription(DESCRIPTION);

    await channel.send({ embeds: [embed] });
    console.log('✅ Posted successfully.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exitCode = 1;
  } finally {
    client.destroy();
  }
});

client.login(process.env.BOT_TOKEN).catch(err => {
  console.error('Login failed:', err.message);
  process.exit(1);
});
