const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { loadPlanks, savePlanks, getLeaderboard, currentMonth } = require('../utils/plankStorage');

const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('plankboard')
    .setDescription('Plank leaderboard — tracks deaths this month')
    .addSubcommand(sub => sub
      .setName('show')
      .setDescription('Show the current month plank leaderboard')
    )
    .addSubcommand(sub => sub
      .setName('setchannel')
      .setDescription('Set the channel to watch for death notifications')
      .addChannelOption(opt => opt.setName('channel').setDescription('Death notification channel').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('reset')
      .setDescription('Manually reset the plank leaderboard')
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const data = loadPlanks(guildId);

    if (sub === 'show') {
      const entries = getLeaderboard(data);
      const [year, month] = currentMonth().split('-');
      const monthName = new Date(year, month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

      const embed = new EmbedBuilder()
        .setTitle(`💀 Plank Leaderboard — ${monthName}`)
        .setColor(0x992d22)
        .setTimestamp();

      if (entries.length === 0) {
        embed.setDescription('No deaths recorded this month. Stay safe out there.');
      } else {
        const lines = entries.slice(0, 10).map((e, i) => {
          const medal = MEDALS[i] ?? `${i + 1}.`;
          return `${medal} **${e.name}** — ${e.count} plank${e.count === 1 ? '' : 's'}`;
        });
        embed.setDescription(lines.join('\n'));
        embed.setFooter({ text: `${entries.length} player${entries.length === 1 ? '' : 's'} recorded` });
      }

      await interaction.reply({ embeds: [embed] });

    } else if (sub === 'setchannel') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: '❌ You need Manage Server permission.', flags: 64 });
      }
      const channel = interaction.options.getChannel('channel');
      data.channelId = channel.id;
      savePlanks(guildId, data);
      await interaction.reply({ content: `✅ Now watching ${channel} for death notifications.`, flags: 64 });

    } else if (sub === 'reset') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: '❌ You need Manage Server permission.', flags: 64 });
      }
      data.deaths = {};
      data.month = currentMonth();
      savePlanks(guildId, data);
      await interaction.reply({ content: '✅ Plank leaderboard has been reset.', flags: 64 });
    }
  }
};
