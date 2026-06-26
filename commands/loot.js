const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { loadLoot, saveLoot, addPending } = require('../utils/lootStorage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loot')
    .setDescription('Manual loot submission for mobile players')
    .addSubcommand(sub => sub
      .setName('submit')
      .setDescription('Submit a drop for leaderboard approval')
      .addStringOption(opt => opt.setName('rsn').setDescription('Your OSRS username').setRequired(true))
      .addStringOption(opt => opt.setName('value').setDescription('GP value (e.g. 1.5M, 876K, 1500000)').setRequired(true))
      .addStringOption(opt => opt.setName('item').setDescription('Item name (optional)'))
      .addAttachmentOption(opt => opt.setName('screenshot').setDescription('Screenshot of the drop (optional but recommended)'))
    )
    .addSubcommand(sub => sub
      .setName('setchannel')
      .setDescription('Set the channel where loot submissions are reviewed')
      .addChannelOption(opt => opt.setName('channel').setDescription('Review channel').setRequired(true))
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const data = loadLoot(guildId);

    if (sub === 'setchannel') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: '❌ You need Manage Server permission.', flags: 64 });
      }
      const channel = interaction.options.getChannel('channel');
      data.reviewChannelId = channel.id;
      saveLoot(guildId, data);
      return interaction.reply({ content: `✅ Loot submissions will be reviewed in ${channel}.`, flags: 64 });
    }

    if (sub === 'submit') {
      if (!data.reviewChannelId) {
        return interaction.reply({ content: '❌ No review channel set yet. Ask an admin to run `/loot setchannel`.', flags: 64 });
      }

      const rsn = interaction.options.getString('rsn');
      const valueStr = interaction.options.getString('value');
      const item = interaction.options.getString('item');
      const screenshot = interaction.options.getAttachment('screenshot');

      const gpValue = parseGpString(valueStr);
      if (!gpValue || gpValue <= 0) {
        return interaction.reply({ content: '❌ Could not parse that GP value. Try formats like `1.5M`, `876K`, or `1500000`.', flags: 64 });
      }

      const reviewChannel = await interaction.client.channels.fetch(data.reviewChannelId).catch(() => null);
      if (!reviewChannel) {
        return interaction.reply({ content: '❌ Review channel not found. Ask an admin to run `/loot setchannel` again.', flags: 64 });
      }

      const formatted = formatGp(gpValue);
      const embed = new EmbedBuilder()
        .setTitle('💰 Loot Submission — Pending Review')
        .setColor(0xf1c40f)
        .addFields(
          { name: 'Player', value: rsn, inline: true },
          { name: 'Value', value: formatted, inline: true },
          { name: 'Submitted by', value: `<@${interaction.user.id}>`, inline: true },
        )
        .setTimestamp();

      if (item) embed.addFields({ name: 'Item', value: item, inline: true });
      if (screenshot) embed.setImage(screenshot.url);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('loot_approve:PLACEHOLDER')
          .setLabel('✅ Approve')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('loot_reject:PLACEHOLDER')
          .setLabel('❌ Reject')
          .setStyle(ButtonStyle.Danger)
      );

      const reviewMsg = await reviewChannel.send({ embeds: [embed], components: [row] });

      // Now update buttons with the real message ID
      const realRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`loot_approve:${reviewMsg.id}`)
          .setLabel('✅ Approve')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`loot_reject:${reviewMsg.id}`)
          .setLabel('❌ Reject')
          .setStyle(ButtonStyle.Danger)
      );
      await reviewMsg.edit({ components: [realRow] });

      addPending(guildId, data, reviewMsg.id, {
        rsn,
        gpValue,
        item: item ?? null,
        userId: interaction.user.id,
        submittedAt: Date.now()
      });

      return interaction.reply({ content: `✅ Your drop of **${formatted}** has been submitted for review!`, flags: 64 });
    }
  }
};

function parseGpString(str) {
  if (!str) return null;
  const clean = str.replace(/,/g, '').trim();
  const match = clean.match(/^([\d.]+)\s*([KMBkmb])?/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const suffix = (match[2] ?? '').toUpperCase();
  if (suffix === 'B') return Math.round(num * 1_000_000_000);
  if (suffix === 'M') return Math.round(num * 1_000_000);
  if (suffix === 'K') return Math.round(num * 1_000);
  return Math.round(num);
}

function formatGp(value) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B gp`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M gp`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K gp`;
  return `${value} gp`;
}
