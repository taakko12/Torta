const { makeRemoveCommand } = require('../utils/boardCommandFactory');

module.exports = makeRemoveCommand({
  boardKey: 'sotw',
  label: 'Skill of the Week',
  commandName: 'removesotw',
  embedTitle: '📈 Skill of the Week Leaderboard',
  color: 0x57f287
});
