const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { womGet } = require('../utils/womClient');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ehbgained')
    .setDescription('Show EHB gained this month for an OSRS player')
    .addStringOption(opt =>
      opt.setName('username').setDescription('OSRS username').setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const username = interaction.options.getString('username');

    let gained;
    try {
      gained = await womGet(`/players/${encodeURIComponent(username)}/gained?period=month`);
    } catch (err) {
      const msg = err.message?.toLowerCase() ?? '';
      if (msg.includes('not found') || msg.includes('player_not_found')) {
        return interaction.editReply({ content: `❌ Player **${username}** not found on Wise Old Man.` });
      }
      console.error(`[ehbgained] WOM fetch failed for "${username}": ${err.message}`);
      return interaction.editReply({ content: '❌ Failed to fetch EHB data. Try again later.' });
    }

    const ehb = gained?.data?.computed?.ehb?.value ?? null;

    const embed = new EmbedBuilder()
      .setTitle(`💀 EHB Gained — ${username}`)
      .setColor(0xed4245)
      .addFields({
        name: 'EHB Gained (This Month)',
        value: ehb != null ? `${Math.round(ehb).toLocaleString('en-US')} EHB` : 'N/A',
        inline: true
      })
      .setFooter({ text: 'Powered by Wise Old Man' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
