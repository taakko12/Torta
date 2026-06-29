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
    .addSubcommand(sub => sub
      .setName('player')
      .setDescription('Player overview — total level, XP, EHP, EHB')
      .addStringOption(opt => opt.setName('username').setDescription('RSN to look up').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('gained')
      .setDescription('EHP and EHB gained this month')
      .addStringOption(opt => opt.setName('username').setDescription('RSN to look up').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const username = interaction.options.getString('username');
    await interaction.deferReply();

    if (sub === 'player') {
      let player;
      try {
        player = await womGet(`/players/${encodeURIComponent(username)}`);
      } catch (err) {
        const msg = err.message?.toLowerCase() ?? '';
        if (msg.includes('not found') || msg.includes('player_not_found')) {
          return interaction.editReply({ content: `❌ Player **${username}** not found on Wise Old Man.` });
        }
        console.error(`[lookup player] WOM fetch failed for "${username}": ${err.message}`);
        return interaction.editReply({ content: '❌ Failed to fetch player data. Try again later.' });
      }

      const skills = player.latestSnapshot?.data?.skills;
      const computed = player.latestSnapshot?.data?.computed;
      const lastUpdated = player.updatedAt
        ? `<t:${Math.floor(new Date(player.updatedAt).getTime() / 1000)}:R>`
        : 'Never';

      return interaction.editReply({ embeds: [
        new EmbedBuilder()
          .setTitle(`🔍 ${player.displayName}`)
          .setColor(0x2980b9)
          .setURL(`https://wiseoldman.net/players/${encodeURIComponent(player.username)}`)
          .addFields(
            { name: 'Total Level', value: String(skills?.overall?.level ?? 'N/A'), inline: true },
            { name: 'Total XP', value: fmt(skills?.overall?.experience ?? null), inline: true },
            { name: 'EHP', value: computed?.ehp?.value != null ? fmt(Math.round(computed.ehp.value)) : 'N/A', inline: true },
            { name: 'EHB', value: computed?.ehb?.value != null ? fmt(Math.round(computed.ehb.value)) : 'N/A', inline: true },
            { name: 'Build', value: player.build ?? 'main', inline: true },
            { name: 'Country', value: player.country ?? '—', inline: true }
          )
          .setFooter({ text: `Last updated: ${lastUpdated}` })
          .setTimestamp(),
      ] });
    }

    if (sub === 'gained') {
      let gained;
      try {
        gained = await womGet(`/players/${encodeURIComponent(username)}/gained?period=month`);
      } catch (err) {
        const msg = err.message?.toLowerCase() ?? '';
        if (msg.includes('not found') || msg.includes('player_not_found')) {
          return interaction.editReply({ content: `❌ Player **${username}** not found on Wise Old Man.` });
        }
        console.error(`[lookup gained] WOM fetch failed for "${username}": ${err.message}`);
        return interaction.editReply({ content: '❌ Failed to fetch gained data. Try again later.' });
      }

      const ehp = gained?.data?.computed?.ehp?.value ?? null;
      const ehb = gained?.data?.computed?.ehb?.value ?? null;

      return interaction.editReply({ embeds: [
        new EmbedBuilder()
          .setTitle(`📊 Monthly Gains — ${username}`)
          .setColor(0x2980b9)
          .addFields(
            { name: 'EHP Gained', value: ehp != null ? `${Math.round(ehp).toLocaleString('en-US')} EHP` : 'N/A', inline: true },
            { name: 'EHB Gained', value: ehb != null ? `${Math.round(ehb).toLocaleString('en-US')} EHB` : 'N/A', inline: true }
          )
          .setFooter({ text: 'Powered by Wise Old Man · Period: this month' })
          .setTimestamp(),
      ] });
    }
  },
};
