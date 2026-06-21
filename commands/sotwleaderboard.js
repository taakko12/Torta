const { makeLeaderboardCommand } = require('../utils/boardCommandFactory');

module.exports = makeLeaderboardCommand({
  boardKey: 'sotw',
  label: 'Skill of the Week',
  commandName: 'sotwleaderboard',
  embedTitle: '📈 Skill of the Week Leaderboard',
  color: 0x57f287
});
