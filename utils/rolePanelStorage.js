const fs = require('fs');
const path = require('path');

const DEFAULT = { channelId: null, messageId: null, roles: [] };

function dataPath(guildId) {
  return path.join(__dirname, '..', 'data', guildId, 'rolepanel.json');
}

function loadPanel(guildId) {
  const p = dataPath(guildId);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(DEFAULT, null, 2));
    return { ...DEFAULT };
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function savePanel(guildId, data) {
  const p = dataPath(guildId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

module.exports = { loadPanel, savePanel };
