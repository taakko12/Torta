const fs = require('fs');
const path = require('path');

const DEFAULT = { channelId: null, month: null, deaths: {} };

function dataPath(guildId) {
  return path.join(__dirname, '..', 'data', guildId, 'planks.json');
}

function loadPlanks(guildId) {
  const p = dataPath(guildId);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(DEFAULT, null, 2));
    return { ...DEFAULT };
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function savePlanks(guildId, data) {
  const p = dataPath(guildId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function checkAndReset(data) {
  const month = currentMonth();
  if (data.month !== month) {
    data.month = month;
    data.deaths = {};
    return true;
  }
  return false;
}

function recordDeath(guildId, data, playerName) {
  checkAndReset(data);
  const key = playerName.toLowerCase();
  data.deaths[key] = (data.deaths[key] ?? 0) + 1;
  savePlanks(guildId, data);
}

function getLeaderboard(data) {
  checkAndReset(data);
  return Object.entries(data.deaths)
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => ({ name, count }));
}

module.exports = { loadPlanks, savePlanks, recordDeath, getLeaderboard, currentMonth, checkAndReset };
