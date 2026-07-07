const { SlashCommandBuilder } = require('discord.js')
const { setLink } = require('../utils/linkStorage')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Discord account to your RuneScape username')
    .addStringOption(opt =>
      opt.setName('rsn').setDescription('Your RuneScape username').setRequired(true)
    ),

  async execute(interaction) {
    const rsn = interaction.options.getString('rsn').trim()
    if (!rsn) return interaction.reply({ content: '❌ Please provide a valid RSN.', flags: 64 })
    await setLink(interaction.user.id, interaction.guildId, rsn)
    await interaction.reply({
      content: `✅ Linked your Discord to **${rsn}**. Staff can now see your combined activity.`,
      flags: 64,
    })
  },
}
