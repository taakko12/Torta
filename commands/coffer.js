const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getLeaderboard, buildCofferEmbed, updateLeaderboardEmbed } = require('../utils/cofferStorage');
const supabase = require('../utils/supabase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coffer')
    .setDescription('Clan coffer donation tracking')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('setup')
        .setDescription('Post the pinned leaderboard embed to a channel (re-run to move it)')
        .addChannelOption(opt =>
          opt.setName('channel').setDescription('Channel to post the leaderboard in').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('leaderboard')
        .setDescription('Show the current coffer leaderboard')
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');
      await interaction.deferReply({ flags: 64 });
      const leaderboard = await getLeaderboard(guildId);
      const msg = await channel.send({ embeds: [buildCofferEmbed(leaderboard)] });
      await supabase.from('guild_config').upsert({
        guild_id: guildId,
        coffer_leaderboard_channel_id: channel.id,
        coffer_leaderboard_message_id: msg.id,
      }, { onConflict: 'guild_id' });
      return interaction.editReply({ content: `✅ Coffer leaderboard posted in <#${channel.id}>. It will auto-update with every donation.` });
    }

    if (sub === 'leaderboard') {
      const leaderboard = await getLeaderboard(guildId);
      return interaction.reply({ embeds: [buildCofferEmbed(leaderboard)], flags: 64 });
    }
  },
};
