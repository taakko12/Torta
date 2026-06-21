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

    if (process.env.GUILD_ID) {
      // Guild-specific deploy: updates instantly, ideal while testing
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log('✅ Guild commands deployed.');
    } else {
      // Global deploy: can take up to ~1 hour to propagate to all servers
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
        body: commands
      });
      console.log('✅ Global commands deployed.');
    }
  } catch (err) {
    console.error(err);
  }
})();
