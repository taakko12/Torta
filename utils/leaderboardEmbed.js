const { EmbedBuilder } = require('discord.js');
const { MEDALS } = require('./constants');

// board = { users: { [userId]: { wins } } }
// options = { title, color, emptyText }
function buildLeaderboardEmbed(board, options = {}) {
  const title = options.title ?? '🏆 Leaderboard';
  const color = options.color ?? 0xf5a623;
  const emptyText = options.emptyText ?? 'No wins recorded yet. Use the add command to get started!';

  const sorted = Object.entries(board.users)
    .filter(([, u]) => u.wins > 0)
    .sort((a, b) => b[1].wins - a[1].wins)
    .slice(0, 3);

  const embed = new EmbedBuilder().setTitle(title).setColor(color).setTimestamp();

  if (sorted.length === 0) {
    embed.setDescription(emptyText);
    return embed;
  }

  const lines = sorted.map(([userId, u], i) => {
    const medal = MEDALS[i] || `${i + 1}.`;
    return `${medal} <@${userId}> — **${u.wins}** win${u.wins === 1 ? '' : 's'}`;
  });

  embed.setDescription(lines.join('\n\n'));
  embed.setFooter({ text: 'Updates automatically whenever wins change' });

  return embed;
}

module.exports = { buildLeaderboardEmbed };
