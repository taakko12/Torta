const { makeSetCommand } = require('../utils/boardCommandFactory');

module.exports = makeSetCommand({
  boardKey: 'botw',
  label: 'Boss of the Week',
  commandName: 'setbotw',
  embedTitle: '💀 Boss of the Week Leaderboard',
  color: 0xed4245
});
