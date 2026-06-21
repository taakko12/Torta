const { makeLeaderboardCommand } = require('../utils/boardCommandFactory');

module.exports = makeLeaderboardCommand({
  boardKey: 'botw',
  label: 'Boss of the Week',
  commandName: 'botwleaderboard',
  embedTitle: '💀 Boss of the Week Leaderboard',
  color: 0xed4245
});
