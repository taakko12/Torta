const { SlashCommandBuilder } = require('discord.js');
const { loadRaids } = require('../utils/raidStorage');
const { buildRaidEmbed } = require('../utils/raidEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('raidroster')
    .setDescription('Show the current signup roster for a raid')
    .addStringOption(opt =>
      opt.setName('raidid').setDescription('Raid ID from the footer of the raid post').setRequired(true)
    ),

  async execute(interaction) {
    const raidId = interaction.options.getString('raidid');
    const data = loadRaids(interaction.guildId);
    const raid = data.raids[raidId];

    if (!raid) {
      await interaction.reply({ content: '❌ No raid found with that ID.', flags: 64 });
      return;
    }

    await interaction.reply({ embeds: [buildRaidEmbed(raid)], flags: 64 });
  }
};
