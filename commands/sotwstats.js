const { SlashCommandBuilder } = require('discord.js');
const { getCurrentSkillCompetition, getCompetitionStandings } = require('../utils/wom');
const { buildCompetitionEmbed } = require('../utils/womEmbeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sotwstats')
    .setDescription("Show this week's Skill of the Week competition standings (from Wise Old Man)"),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const competition = await getCurrentSkillCompetition();

      if (!competition) {
        await interaction.editReply('📭 No active Skill of the Week competition right now.');
        return;
      }

      const standings = await getCompetitionStandings(competition.id);
      const embed = buildCompetitionEmbed(competition, standings, {
        color: 0x57f287,
        unit: 'xp'
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('sotwstats error:', err);
      await interaction.editReply('❌ Could not fetch Skill of the Week data from Wise Old Man. Try again in a bit.');
    }
  }
};
