const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadPanel, savePanel } = require('../utils/rolePanelStorage');
const { buildPanelEmbed, buildPanelRows } = require('../utils/rolePanelEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rolepanel')
    .setDescription('Manage the role selection panel')
    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Post the role selection panel in this channel')
    )
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add a role to the panel')
      .addRoleOption(opt => opt.setName('role').setDescription('Role to add').setRequired(true))
      .addStringOption(opt => opt.setName('emoji').setDescription('Emoji for this role (e.g. ⚔️)').setRequired(true))
      .addStringOption(opt => opt.setName('label').setDescription('Button label (defaults to role name)'))
    )
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove a role from the panel')
      .addRoleOption(opt => opt.setName('role').setDescription('Role to remove').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List all roles currently on the panel')
    )
    .setDefaultMemberPermissions(0n),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const panel = loadPanel(guildId);

    if (sub === 'create') {
      const embed = buildPanelEmbed(panel.roles);
      const rows = buildPanelRows(panel.roles);

      if (panel.channelId && panel.messageId) {
        try {
          const oldChannel = await interaction.client.channels.fetch(panel.channelId);
          const oldMessage = await oldChannel.messages.fetch(panel.messageId);
          await oldMessage.delete();
        } catch {
          // Old message already gone
        }
      }

      const message = await interaction.channel.send({ embeds: [embed], components: rows });
      panel.channelId = interaction.channel.id;
      panel.messageId = message.id;
      savePanel(guildId, panel);

      await interaction.reply({ content: '✅ Role panel posted!', flags: 64 });

    } else if (sub === 'add') {
      const role = interaction.options.getRole('role');
      const emoji = interaction.options.getString('emoji');
      const label = interaction.options.getString('label') ?? role.name;

      if (panel.roles.some(r => r.roleId === role.id)) {
        return interaction.reply({ content: `❌ <@&${role.id}> is already on the panel.`, flags: 64 });
      }
      if (panel.roles.length >= 25) {
        return interaction.reply({ content: '❌ Maximum of 25 roles per panel.', flags: 64 });
      }

      panel.roles.push({ roleId: role.id, emoji, label });
      savePanel(guildId, panel);
      await updatePanelMessage(interaction.client, panel);

      await interaction.reply({ content: `✅ Added ${emoji} <@&${role.id}> to the panel.`, flags: 64 });

    } else if (sub === 'remove') {
      const role = interaction.options.getRole('role');
      const before = panel.roles.length;
      panel.roles = panel.roles.filter(r => r.roleId !== role.id);

      if (panel.roles.length === before) {
        return interaction.reply({ content: `❌ <@&${role.id}> is not on the panel.`, flags: 64 });
      }

      savePanel(guildId, panel);
      await updatePanelMessage(interaction.client, panel);

      await interaction.reply({ content: `✅ Removed <@&${role.id}> from the panel.`, flags: 64 });

    } else if (sub === 'list') {
      if (panel.roles.length === 0) {
        return interaction.reply({ content: '📋 No roles on the panel yet. Use `/rolepanel add` to add some.', flags: 64 });
      }
      const lines = panel.roles.map(r => `${r.emoji} <@&${r.roleId}> — \`${r.label}\``);
      await interaction.reply({ content: `**Role Panel (${panel.roles.length}):**\n${lines.join('\n')}`, flags: 64 });
    }
  }
};

async function updatePanelMessage(client, panel) {
  if (!panel.channelId || !panel.messageId) return;
  try {
    const channel = await client.channels.fetch(panel.channelId);
    const message = await channel.messages.fetch(panel.messageId);
    await message.edit({
      embeds: [buildPanelEmbed(panel.roles)],
      components: buildPanelRows(panel.roles)
    });
  } catch (err) {
    console.error(`[rolepanel] Failed to update panel message: ${err.message}`);
    console.error('             Run /rolepanel create again to repost it.');
  }
}
