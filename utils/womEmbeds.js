const { EmbedBuilder } = require('discord.js');

const MEDALS = ['🥇', '🥈', '🥉'];

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

module.exports = { humanize, formatNumber, buildCompetitionEmbed, buildGainedEmbed };
