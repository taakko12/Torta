const { SlashCommandBuilder } = require('discord.js');
const { getGroupGained } = require('../utils/wom');
const { buildGainedEmbed } = require('../utils/womEmbeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ehpgained')
    .setDescription('Show the top 3 clan members by EHP gained this week (from Wise Old Man)'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const entries = await getGroupGained('ehp', 'week', 3);
      const embed = buildGainedEmbed({
        title: '📈 Top EHP Gained This Week',
        color: 0x57f287,
        metric: 'ehp',
        entries
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('ehpgained error:', err);
      await interaction.editReply('❌ Could not fetch EHP gains from Wise Old Man. Try again in a bit.');
    }
  }
};
