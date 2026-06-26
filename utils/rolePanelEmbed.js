const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function buildPanelEmbed(roles) {
  const embed = new EmbedBuilder()
    .setTitle('🎭 Role Selection')
    .setColor(0x5865f2)
    .setTimestamp();

  if (roles.length === 0) {
    embed.setDescription('No roles have been added yet. Admins can use `/rolepanel add` to get started.');
    return embed;
  }

  const lines = roles.map(r => `${r.emoji}  <@&${r.roleId}>`);
  embed.setDescription(lines.join('\n') + '\n\n**Click a button below to toggle a role.**');
  return embed;
}

function buildPanelRows(roles) {
  if (roles.length === 0) return [];

  const rows = [];
  // Discord allows max 5 buttons per row, 5 rows per message = 25 buttons max
  for (let i = 0; i < roles.length; i += 5) {
    const row = new ActionRowBuilder();
    for (const role of roles.slice(i, i + 5)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`rolepanel:${role.roleId}`)
          .setLabel(role.label)
          .setEmoji(role.emoji)
          .setStyle(ButtonStyle.Secondary)
      );
    }
    rows.push(row);
  }
  return rows;
}

module.exports = { buildPanelEmbed, buildPanelRows };
