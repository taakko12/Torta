const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { womGet } = require('../utils/womClient');

function fmt(n) {
  if (n == null) return 'N/A';
  return n.toLocaleString('en-US');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lookup')
    .setDescription('Look up an OSRS player on Wise Old Man')
    .addStringOption(opt =>
      opt.setName('username').setDescription('RSN to look up').setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const username = interaction.options.getString('username');

    let player;
    try {
      player = await womGet(`/players/${encodeURIComponent(username)}`);
    } catch (err) {
      const msg = err.message?.toLowerCase() ?? '';
      if (msg.includes('not found') || msg.includes('player_not_found')) {
        return interaction.editReply({ content: `❌ Player **${username}** not found on Wise Old Man.` });
      }
      console.error(`[lookup] WOM fetch failed for "${username}": ${err.message}`);
      return interaction.editReply({ content: '❌ Failed to fetch player data. Try again later.' });
    }

    const skills = player.latestSnapshot?.data?.skills;
    const computed = player.latestSnapshot?.data?.computed;

    const totalLevel = skills?.overall?.level ?? 'N/A';
    const totalXp = skills?.overall?.experience ?? null;
    const ehp = computed?.ehp?.value ?? null;
    const ehb = computed?.ehb?.value ?? null;

    const lastUpdated = player.updatedAt
      ? `<t:${Math.floor(new Date(player.updatedAt).getTime() / 1000)}:R>`
      : 'Never';

    const embed = new EmbedBuilder()
      .setTitle(`🔍 ${player.displayName}`)
      .setColor(0x2980b9)
      .setURL(`https://wiseoldman.net/players/${encodeURIComponent(player.username)}`)
      .addFields(
        { name: 'Total Level', value: String(totalLevel), inline: true },
        { name: 'Total XP', value: totalXp != null ? fmt(totalXp) : 'N/A', inline: true },
        { name: 'EHP', value: ehp != null ? fmt(Math.round(ehp)) : 'N/A', inline: true },
        { name: 'EHB', value: ehb != null ? fmt(Math.round(ehb)) : 'N/A', inline: true },
        { name: 'Build', value: player.build ?? 'main', inline: true },
        { name: 'Country', value: player.country ?? '—', inline: true }
      )
      .setFooter({ text: `Last updated: ${lastUpdated}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
