const { makeRemoveCommand } = require('../utils/boardCommandFactory');

module.exports = makeRemoveCommand({
  boardKey: 'botw',
  label: 'Boss of the Week',
  commandName: 'removebotw',
  embedTitle: '💀 Boss of the Week Leaderboard',
  color: 0xed4245
});
