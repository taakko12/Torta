const fs = require('fs');
const path = require('path');

const DEFAULT = { reviewChannelId: null, pending: {} };

function dataPath(guildId) {
  return path.join(__dirname, '..', 'data', guildId, 'loot.json');
}

function loadLoot(guildId) {
  const p = dataPath(guildId);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(DEFAULT, null, 2));
    return { ...DEFAULT, pending: {} };
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function saveLoot(guildId, data) {
  const p = dataPath(guildId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function addPending(guildId, data, messageId, entry) {
  data.pending[messageId] = entry;
  saveLoot(guildId, data);
}

function resolvePending(guildId, data, messageId) {
  const entry = data.pending[messageId] ?? null;
  delete data.pending[messageId];
  saveLoot(guildId, data);
  return entry;
}

module.exports = { loadLoot, saveLoot, addPending, resolvePending };
