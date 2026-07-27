const { EmbedBuilder } = require('discord.js');
const { MEDALS } = require('./constants');

function humanize(metricKey) {
  return metricKey
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatNumber(n) {
  return Math.round(n).toLocaleString('en-US');
}

// Builds an embed for a specific competition's live standings.
// unit: 'xp' or 'kc' just changes the trailing label text.
function buildCompetitionEmbed(competition, standings, { color, unit }) {
  const top = [...standings.participations]
    .sort((a, b) => b.progress.gained - a.progress.gained)
    .slice(0, 3);

  const embed = new EmbedBuilder()
    .setTitle(`📅 ${competition.title}`)
    .setDescription(`**${humanize(competition.metric)}** — ends <t:${Math.floor(new Date(competition.endsAt).getTime() / 1000)}:R>`)
    .setColor(color)
    .setTimestamp();

  if (top.length === 0 || top.every(p => p.progress.gained <= 0)) {
    embed.addFields({ name: 'Standings', value: 'No progress recorded yet.' });
    return embed;
  }

  const unitLabel = unit === 'kc' ? 'kc' : 'xp';
  const lines = top.map((p, i) => {
    const medal = MEDALS[i] || `${i + 1}.`;
    return `${medal} **${p.player.displayName}** — ${formatNumber(p.progress.gained)} ${unitLabel} gained`;
  });

  embed.addFields({ name: 'Top 3', value: lines.join('\n') });
  return embed;
}

// Public "competition has begun" announcement, posted when WOM's startsAt is reached.
function buildCompetitionStartedEmbed(competition, { compType, groupLabel }) {
  const noun = compType === 'botw' ? 'Boss' : 'Skill';
  const color = compType === 'botw' ? 0xe74c3c : 0x57f287;
  const goal = compType === 'botw' ? 'Get your KC in — good luck!' : 'Get your XP in — good luck!';

  return new EmbedBuilder()
    .setTitle(`🚀 ${noun} of the Week has begun!`)
    .setColor(color)
    .setDescription(`## ${groupLabel ?? competition.title}\n${goal}`)
    .addFields(
      { name: 'Competition window', value: `<t:${Math.floor(new Date(competition.startsAt).getTime() / 1000)}:f> — <t:${Math.floor(new Date(competition.endsAt).getTime() / 1000)}:f>` },
      { name: '🏆 WOM Competition', value: `[View live standings →](https://wiseoldman.net/competitions/${competition.id})` },
    )
    .setTimestamp();
}

// Public "competition has ended" results announcement (top 3), independent of
// the mod-approval winner flow in compWinners.js.
function buildCompetitionEndedEmbed({ compType, label, standings, unit }) {
  const color = compType === 'botw' ? 0xe74c3c : 0x57f287;
  const noun = compType === 'botw' ? 'Boss' : 'Skill';

  const byPlayer = new Map();
  for (const s of standings) {
    for (const p of s.participations ?? []) {
      const key = p.player.username.toLowerCase();
      if (!byPlayer.has(key)) byPlayer.set(key, { player: p.player, gained: 0 });
      byPlayer.get(key).gained += p.progress.gained;
    }
  }
  const top = [...byPlayer.values()].sort((a, b) => b.gained - a.gained).slice(0, 3);

  const embed = new EmbedBuilder()
    .setTitle(`🏁 ${noun} of the Week has ended!`)
    .setColor(color)
    .setDescription(`## ${label}`)
    .setTimestamp();

  if (!top.length || top.every(p => p.gained <= 0)) {
    embed.addFields({ name: 'Top 3', value: 'No progress recorded.' });
    return embed;
  }

  const lines = top.map((p, i) => {
    const medal = MEDALS[i] || `${i + 1}.`;
    return `${medal} **${p.player.displayName}** — ${formatNumber(p.gained)} ${unit} gained`;
  });

  embed.addFields(
    { name: 'Top 3', value: lines.join('\n') },
    { name: '🏆 Full standings', value: `[View on Wise Old Man →](https://wiseoldman.net/competitions/${standings[0].id})` },
  );
  return embed;
}

// Builds an embed for a clan-wide /groups/:id/gained leaderboard (EHP/EHB).
function buildGainedEmbed({ title, color, metric, entries }) {
  const embed = new EmbedBuilder().setTitle(title).setColor(color).setTimestamp();

  if (!entries || entries.length === 0) {
    embed.setDescription('No gains recorded for this period yet.');
    return embed;
  }

  const lines = entries.map((entry, i) => {
    const medal = MEDALS[i] || `${i + 1}.`;
    const gained = entry.data.gained;
    return `${medal} **${entry.player.displayName}** — ${gained.toFixed(2)} ${metric.toUpperCase()} gained`;
  });

  embed.setDescription(lines.join('\n'));
  embed.setFooter({ text: 'Data from Wise Old Man · Period: this week' });
  return embed;
}

module.exports = { humanize, formatNumber, buildCompetitionEmbed, buildGainedEmbed, buildCompetitionStartedEmbed, buildCompetitionEndedEmbed };
