const { makeSetCommand } = require('../utils/boardCommandFactory');

module.exports = makeSetCommand({
  boardKey: 'sotw',
  label: 'Skill of the Week',
  commandName: 'setsotw',
  embedTitle: '📈 Skill of the Week Leaderboard',
  color: 0x57f287
});
