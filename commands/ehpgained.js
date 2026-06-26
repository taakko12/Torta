const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { womGet } = require('../utils/womClient');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ehpgained')
    .setDescription('Show EHP gained this month for an OSRS player')
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
      console.error(`[ehpgained] WOM fetch failed for "${username}": ${err.message}`);
      return interaction.editReply({ content: '❌ Failed to fetch EHP data. Try again later.' });
    }

    const ehp = gained?.data?.computed?.ehp?.value ?? null;

    const embed = new EmbedBuilder()
      .setTitle(`📈 EHP Gained — ${username}`)
      .setColor(0x57f287)
      .addFields({
        name: 'EHP Gained (This Month)',
        value: ehp != null ? `${Math.round(ehp).toLocaleString('en-US')} EHP` : 'N/A',
        inline: true
      })
      .setFooter({ text: 'Powered by Wise Old Man' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
