const { buildLeaderboardEmbed } = require('./leaderboardEmbed');

// board = { users, leaderboardMessage: { channelId, messageId } | null }
// embedOptions = { title, color, emptyText } - passed through to buildLeaderboardEmbed
async function refreshLeaderboardMessage(client, board, embedOptions = {}) {
  if (!board.leaderboardMessage) return;

  const { channelId, messageId } = board.leaderboardMessage;

  try {
    const channel = await client.channels.fetch(channelId);
    const message = await channel.messages.fetch(messageId);
    const embed = buildLeaderboardEmbed(board, embedOptions);
    await message.edit({ embeds: [embed] });
  } catch (err) {
    console.error(`[leaderboard] Failed to update message (channel: ${channelId}, msg: ${messageId}): ${err.message}`);
    console.error('              The leaderboard message may have been deleted. Run /sotwleaderboard or /botwleaderboard again to repost it.');
  }
}

module.exports = { refreshLeaderboardMessage };
