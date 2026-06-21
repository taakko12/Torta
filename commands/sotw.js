const { makeCheckCommand } = require('../utils/boardCommandFactory');

module.exports = makeCheckCommand({
  boardKey: 'sotw',
  label: 'Skill of the Week',
  commandName: 'sotw',
  checkEmoji: '📈'
});
