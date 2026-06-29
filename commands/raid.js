const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadRaids, createRaid } = require('../utils/raidStorage');
const { buildRaidEmbed, buildRaidButtons } = require('../utils/raidEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('raid')
    .setDescription('Raid scheduling and rosters')
    .addSubcommand(sub => sub
      .setName('schedule')
      .setDescription('Schedule a raid event with sign-up')
      .addStringOption(opt => opt.setName('name').setDescription('Raid name (e.g. "Theatre of Blood")').setRequired(true))
      .addIntegerOption(opt => opt.setName('timestamp').setDescription('Unix timestamp for the raid time').setRequired(true))
      .addStringOption(opt => opt.setName('description').setDescription('Optional details or notes'))
    )
    .addSubcommand(sub => sub
      .setName('roster')
      .setDescription('Show the current signup roster for a raid')
      .addStringOption(opt => opt.setName('raidid').setDescription('Raid ID from the footer of the raid post').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'schedule') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: '❌ You need Manage Server permission.', flags: 64 });
      }

      const guildId = interaction.guildId;
      const name = interaction.options.getString('name');
      const timestamp = interaction.options.getInteger('timestamp');
      const description = interaction.options.getString('description');
      const raidId = `${guildId}-${timestamp}-${Date.now()}`;

      const raid = {
        id: raidId, guildId, name, timestamp,
        description: description ?? null,
        signups: [], attendees: null,
        channelId: interaction.channel.id,
        messageId: null,
        reminded24h: false, reminded1h: false,
      };

      const message = await interaction.channel.send({ embeds: [buildRaidEmbed(raid)], components: buildRaidButtons(raidId) });
      raid.messageId = message.id;
      createRaid(guildId, loadRaids(guildId), raidId, raid);
      return interaction.reply({ content: '✅ Raid scheduled!', flags: 64 });
    }

    if (sub === 'roster') {
      const raidId = interaction.options.getString('raidid');
      const raid = loadRaids(interaction.guildId).raids[raidId];
      if (!raid) return interaction.reply({ content: '❌ No raid found with that ID.', flags: 64 });
      return interaction.reply({ embeds: [buildRaidEmbed(raid)], flags: 64 });
    }
  },
};
