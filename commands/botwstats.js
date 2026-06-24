const { SlashCommandBuilder } = require('discord.js');
const { getCurrentBossCompetition, getCompetitionStandings } = require('../utils/wom');
const { buildCompetitionEmbed } = require('../utils/womEmbeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('botwstats')
    .setDescription("Show this week's Boss of the Week competition standings (from Wise Old Man)"),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const competition = await getCurrentBossCompetition();

      if (!competition) {
        await interaction.editReply('📭 No active Boss of the Week competition right now.');
        return;
      }

      const standings = await getCompetitionStandings(competition.id);
      const embed = buildCompetitionEmbed(competition, standings, {
        color: 0xed4245,
        unit: 'kc'
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('botwstats error:', err);
      await interaction.editReply('❌ Could not fetch Boss of the Week data from Wise Old Man. Try again in a bit.');
    }
  }
};
