const { makeAddCommand } = require('../utils/boardCommandFactory');

module.exports = makeAddCommand({
  boardKey: 'sotw',
  label: 'Skill of the Week',
  commandName: 'addsotw',
  embedTitle: '📈 Skill of the Week Leaderboard',
  color: 0x57f287
});
