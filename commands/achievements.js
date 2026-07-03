const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadTrackscape } = require('../utils/trackscapeStorage');
const { recordAchievement } = require('../utils/achievementStorage');
const { parseBroadcastAchievementEmbed, dateToSnowflake, fetchAllMessages } = require('../utils/messageHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('Clan achievement tracking')
    .addSubcommand(sub => sub
      .setName('scrape')
      .setDescription('Retroactively import achievements from the broadcast channel')
      .addStringOption(opt => opt
        .setName('period')
        .setDescription('How far back to scan (days, or "all")')
        .addChoices(
          { name: 'Last 30 days', value: '30' },
          { name: 'Last 90 days', value: '90' },
          { name: 'All time', value: 'all' },
        )
      )
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ You need Manage Server permission.', flags: 64 });
    }

    const guildId = interaction.guildId;
    const tsConfig = await loadTrackscape(guildId);
    if (!tsConfig.broadcastChannelId) {
      return interaction.reply({ content: '❌ No broadcast channel configured. Run `/trackscape setup` first.', flags: 64 });
    }

    const channel = await interaction.client.channels.fetch(tsConfig.broadcastChannelId).catch(() => null);
    if (!channel) {
      return interaction.reply({ content: '❌ Broadcast channel not found.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const period = interaction.options.getString('period') ?? 'all';
    const afterSnowflake = period !== 'all'
      ? dateToSnowflake(new Date(Date.now() - parseInt(period) * 86400_000))
      : null;

    let messages;
    try {
      messages = await fetchAllMessages(channel, afterSnowflake);
    } catch (err) {
      return interaction.editReply(`❌ Failed to fetch channel history: ${err.message}`);
    }

    let count = 0;
    for (const msg of messages) {
      if (!msg.author?.bot) continue;
      for (let i = 0; i < (msg.embeds ?? []).length; i++) {
        const parsed = parseBroadcastAchievementEmbed(msg.embeds[i]);
        if (!parsed) continue;
        await recordAchievement(guildId, parsed.player, parsed.title, parsed.description, msg.id, i, msg.createdAt);
        count++;
      }
    }

    const periodLabel = period === 'all' ? 'all time' : `last ${period} days`;
    return interaction.editReply(`✅ Scrape complete (${periodLabel}) — imported **${count}** achievement${count === 1 ? '' : 's'}.`);
  },
};
