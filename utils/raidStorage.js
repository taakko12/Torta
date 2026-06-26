const fs = require('fs');
const path = require('path');

function dataPath(guildId) {
  return path.join(__dirname, '..', 'data', guildId, 'raids.json');
}

function loadRaids(guildId) {
  const p = dataPath(guildId);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ raids: {} }, null, 2));
    return { raids: {} };
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function saveRaids(guildId, data) {
  const p = dataPath(guildId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function getRaid(data, raidId) {
  return data.raids[raidId] ?? null;
}

function createRaid(guildId, data, raidId, raid) {
  data.raids[raidId] = raid;
  saveRaids(guildId, data);
}

function updateRaid(guildId, data, raidId, patch) {
  Object.assign(data.raids[raidId], patch);
  saveRaids(guildId, data);
}

module.exports = { loadRaids, saveRaids, getRaid, createRaid, updateRaid };
