const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits } = require('discord.js');
const { loadAnnounce, saveAnnounce, clearAnnounce } = require('../utils/announceStorage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Schedule the weekly clan announcement')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub
      .setName('schedule')
      .setDescription('Schedule an announcement to post at a specific time')
      .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post in').setRequired(true))
      .addIntegerOption(opt => opt.setName('time').setDescription('Unix timestamp to post at (e.g. 1751900000)').setRequired(true))
      .addStringOption(opt => opt.setName('message').setDescription('Announcement text (or upload a file instead)').setRequired(false))
      .addAttachmentOption(opt => opt.setName('file').setDescription('.txt or .md file').setRequired(false))
    )
    .addSubcommand(sub => sub
      .setName('cancel')
      .setDescription('Cancel the scheduled announcement')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'cancel') {
      if (!loadAnnounce(guildId)) {
        return interaction.reply({ content: '❌ No announcement is scheduled.', flags: 64 });
      }
      clearAnnounce(guildId);
      return interaction.reply({ content: '🗑️ Scheduled announcement cancelled.', flags: 64 });
    }

    // schedule
    const existing = loadAnnounce(guildId);
    if (existing) {
      const embed = new EmbedBuilder()
        .setTitle('⚠️ Announcement Already Scheduled')
        .setColor(0xf39c12)
        .setDescription('Cancel the existing one or download it to edit before re-scheduling.')
        .addFields(
          { name: 'Scheduled for', value: `<t:${Math.floor(existing.scheduledAt / 1000)}:f>`, inline: true },
          { name: 'Channel', value: `<#${existing.channelId}>`, inline: true },
        );
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('announce_download').setLabel('📥 Download Content').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('announce_cancel_btn').setLabel('🗑️ Cancel Announcement').setStyle(ButtonStyle.Danger),
      );
      return interaction.reply({ embeds: [embed], components: [row], flags: 64 });
    }

    const channel = interaction.options.getChannel('channel');
    const time = interaction.options.getInteger('time');
    const message = interaction.options.getString('message');
    const file = interaction.options.getAttachment('file');

    if (!message && !file) {
      return interaction.reply({ content: '❌ Provide a message or upload a `.txt`/`.md` file.', flags: 64 });
    }

    if (time * 1000 <= Date.now()) {
      return interaction.reply({ content: '❌ Scheduled time must be in the future.', flags: 64 });
    }

    let content = message ?? '';

    if (file) {
      const name = file.name ?? '';
      if (!name.endsWith('.txt') && !name.endsWith('.md')) {
        return interaction.reply({ content: '❌ File must be `.txt` or `.md`.', flags: 64 });
      }
      await interaction.deferReply({ ephemeral: true });
      const res = await fetch(file.url);
      content = await res.text();
    }

    if (content.length > 4096) {
      const msg = { content: `❌ Content is ${content.length} characters — embed descriptions cap at 4096. Trim it and try again.`, flags: 64 };
      return file ? interaction.editReply(msg) : interaction.reply(msg);
    }

    saveAnnounce(guildId, { scheduledAt: time * 1000, channelId: channel.id, content });

    const reply = { content: `✅ Announcement scheduled for <t:${time}:f> in <#${channel.id}>.`, flags: 64 };
    return file ? interaction.editReply(reply) : interaction.reply(reply);
  },
};
