const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function buildRaidEmbed(raid) {
  const signups = raid.signups ?? [];
  const attendees = raid.attendees;

  const signupList = signups.length > 0
    ? signups.map((u, i) => `${i + 1}. <@${u.id}>`).join('\n')
    : '*No one signed up yet.*';

  const embed = new EmbedBuilder()
    .setTitle(`⚔️ ${raid.name}`)
    .setColor(attendees ? 0x57f287 : 0xe67e22)
    .addFields(
      { name: '🕐 Time', value: `<t:${raid.timestamp}:F> (<t:${raid.timestamp}:R>)`, inline: false },
      ...(raid.description ? [{ name: '📋 Details', value: raid.description, inline: false }] : []),
      { name: `👥 Signups (${signups.length})`, value: signupList, inline: false }
    )
    .setFooter({ text: `Raid ID: ${raid.id}` })
    .setTimestamp();

  if (attendees) {
    const attendeeList = attendees.length > 0
      ? attendees.map((u, i) => `${i + 1}. <@${u.id}>`).join('\n')
      : '*No attendees recorded.*';
    embed.addFields({ name: `✅ Attended (${attendees.length})`, value: attendeeList, inline: false });
    embed.setTitle(`✅ ${raid.name} — Completed`);
  }

  return embed;
}

function buildRaidButtons(raidId, completed = false) {
  const rows = [];

  if (!completed) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`raid_signup:${raidId}`)
        .setLabel('Sign Up')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`raid_dropout:${raidId}`)
        .setLabel('Drop Out')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`raid_complete:${raidId}`)
        .setLabel('Mark Complete')
        .setStyle(ButtonStyle.Secondary)
    ));
  }

  return rows;
}

module.exports = { buildRaidEmbed, buildRaidButtons };
