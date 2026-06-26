require('dotenv').config();
const { REST, Routes } = require('discord.js');

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  if (!process.env.GUILD_ID) {
    console.error('No GUILD_ID set in .env — nothing to clear.');
    process.exit(1);
  }

  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: [] }
    );
    console.log('✅ Guild-specific commands cleared. Only global commands remain.');
  } catch (err) {
    console.error(err);
  }
})();
