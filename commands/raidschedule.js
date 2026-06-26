const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadRaids, createRaid } = require('../utils/raidStorage');
const { buildRaidEmbed, buildRaidButtons } = require('../utils/raidEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('raidschedule')
    .setDescription('Schedule a raid event with sign-up')
    .addStringOption(opt =>
      opt.setName('name').setDescription('Raid name (e.g. "Theatre of Blood")').setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('timestamp').setDescription('Unix timestamp for the raid time (e.g. 1782259944)').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('description').setDescription('Optional details or notes')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const name = interaction.options.getString('name');
    const timestamp = interaction.options.getInteger('timestamp');
    const description = interaction.options.getString('description');

    const raidId = `${guildId}-${timestamp}-${Date.now()}`;

    const raid = {
      id: raidId,
      guildId,
      name,
      timestamp,
      description: description ?? null,
      signups: [],
      attendees: null,
      channelId: interaction.channel.id,
      messageId: null,
      reminded24h: false,
      reminded1h: false
    };

    const message = await interaction.channel.send({
      embeds: [buildRaidEmbed(raid)],
      components: buildRaidButtons(raidId)
    });

    raid.messageId = message.id;

    const data = loadRaids(guildId);
    createRaid(guildId, data, raidId, raid);

    await interaction.reply({ content: '✅ Raid scheduled!', flags: 64 });
  }
};
