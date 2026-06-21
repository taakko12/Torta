const { makeAddCommand } = require('../utils/boardCommandFactory');

module.exports = makeAddCommand({
  boardKey: 'botw',
  label: 'Boss of the Week',
  commandName: 'addbotw',
  embedTitle: '💀 Boss of the Week Leaderboard',
  color: 0xed4245
});
