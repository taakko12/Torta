const { SlashCommandBuilder } = require('discord.js');
const { getGroupGained } = require('../utils/wom');
const { buildGainedEmbed } = require('../utils/womEmbeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ehbgained')
    .setDescription('Show the top 3 clan members by EHB gained this week (from Wise Old Man)'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const entries = await getGroupGained('ehb', 'week', 3);
      const embed = buildGainedEmbed({
        title: '💀 Top EHB Gained This Week',
        color: 0xed4245,
        metric: 'ehb',
        entries
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('ehbgained error:', err);
      await interaction.editReply('❌ Could not fetch EHB gains from Wise Old Man. Try again in a bit.');
    }
  }
};
