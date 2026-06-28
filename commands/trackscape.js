const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { loadTrackscape, saveTrackscape, generateCode } = require('../utils/trackscapeStorage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trackscape')
    .setDescription('Configure the TrackScape RuneLite plugin integration')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('setup')
        .setDescription('Set clan chat and broadcast channels, generates a code if you don\'t have one')
        .addChannelOption(opt =>
          opt.setName('clanchat')
            .setDescription('Channel to post in-game clan chat messages')
            .setRequired(false)
        )
        .addChannelOption(opt =>
          opt.setName('broadcasts')
            .setDescription('Channel to post achievement broadcasts (drops, pets, quests, etc.)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('code')
        .setDescription('Show your current verification code to share with clan members')
    )
    .addSubcommand(sub =>
      sub.setName('regenerate')
        .setDescription('Generate a new verification code — old code will stop working')
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const config = await loadTrackscape(guildId);

    if (sub === 'setup') {
      const clanChatChannel = interaction.options.getChannel('clanchat');
      const broadcastChannel = interaction.options.getChannel('broadcasts');

      if (clanChatChannel) config.clanChatChannelId = clanChatChannel.id;
      if (broadcastChannel) config.broadcastChannelId = broadcastChannel.id;
      if (!config.verificationCode) config.verificationCode = generateCode();

      await saveTrackscape(guildId, config);

      const port = process.env.TRACKSCAPE_PORT || 3000;
      const host = process.env.TRACKSCAPE_HOST || `your-server-ip:${port}`;

      const embed = new EmbedBuilder()
        .setTitle('TrackScape Setup')
        .setColor(0x0055AA)
        .addFields(
          { name: 'Clan Chat Channel', value: config.clanChatChannelId ? `<#${config.clanChatChannelId}>` : 'Not set', inline: true },
          { name: 'Broadcasts Channel', value: config.broadcastChannelId ? `<#${config.broadcastChannelId}>` : 'Not set', inline: true },
          { name: '​', value: '​', inline: false },
          { name: 'Verification Code', value: `\`${config.verificationCode}\``, inline: false },
          { name: 'HTTP Endpoint (for RuneLite plugin)', value: `\`http://${host}/api/chat/new-clan-chat\``, inline: false },
          { name: 'WebSocket Endpoint (for RuneLite plugin)', value: `\`ws://${host}/api/chat/ws\``, inline: false },
        )
        .setDescription('In RuneLite, open **TrackScape Connector → Advanced Settings**, paste in both URLs above, then enter the verification code in the **Verification Code** field.')
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (sub === 'code') {
      if (!config.verificationCode) {
        return interaction.reply({ content: '❌ No verification code yet. Run `/trackscape setup` first.', flags: 64 });
      }
      return interaction.reply({
        content: `Your TrackScape verification code: \`${config.verificationCode}\`\nShare this with clan members to paste into their RuneLite plugin.`,
        flags: 64
      });
    }

    if (sub === 'regenerate') {
      config.verificationCode = generateCode();
      await saveTrackscape(guildId, config);
      return interaction.reply({
        content: `✅ New code generated: \`${config.verificationCode}\`\nThe old code no longer works. Update the code in your clan members' RuneLite plugins.`,
        flags: 64
      });
    }
  }
};
