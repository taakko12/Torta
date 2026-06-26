const fs = require('fs');
const path = require('path');

const DEFAULT = { channelId: null, messageId: null, roleId: null, modChannelId: null, pending: {} };

function dataPath(guildId) {
  return path.join(__dirname, '..', 'data', guildId, 'welcome.json');
}

function loadWelcome(guildId) {
  const p = dataPath(guildId);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(DEFAULT, null, 2));
    return { ...DEFAULT };
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function saveWelcome(guildId, data) {
  const p = dataPath(guildId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function addWelcomePending(guildId, data, messageId, entry) {
  if (!data.pending) data.pending = {};
  data.pending[messageId] = entry;
  saveWelcome(guildId, data);
}

function resolveWelcomePending(guildId, data, messageId) {
  if (!data.pending) data.pending = {};
  const entry = data.pending[messageId] ?? null;
  delete data.pending[messageId];
  saveWelcome(guildId, data);
  return entry;
}

module.exports = { loadWelcome, saveWelcome, addWelcomePending, resolveWelcomePending };
