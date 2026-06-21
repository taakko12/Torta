const { makeCheckCommand } = require('../utils/boardCommandFactory');

module.exports = makeCheckCommand({
  boardKey: 'botw',
  label: 'Boss of the Week',
  commandName: 'botw',
  checkEmoji: '💀'
});
