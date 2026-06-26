require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  commands.push(command.data.toJSON());
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Deploying ${commands.length} slash command(s)...`);

    // GUILD_IDS can be a comma-separated list for instant multi-server deploy
    const rawIds = process.env.GUILD_IDS || process.env.GUILD_ID || '';
    const guildIds = rawIds.split(',').map(id => id.trim()).filter(Boolean);

    if (guildIds.length > 0) {
      for (const guildId of guildIds) {
        await rest.put(
          Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
          { body: commands }
        );
        console.log(`✅ Commands deployed to guild ${guildId}`);
      }
    } else {
      // Global deploy: can take up to ~1 hour to propagate
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
        body: commands
      });
      console.log('✅ Global commands deployed.');
    }
  } catch (err) {
    console.error(err);
  }
})();
