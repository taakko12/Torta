const fs = require('fs');
const path = require('path');

function dataPath(guildId) {
  return path.join(__dirname, '..', 'data', guildId, 'wins.json');
}

function loadData(guildId) {
  const p = dataPath(guildId);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const initial = { boards: {} };
    fs.writeFileSync(p, JSON.stringify(initial, null, 2));
    return initial;
  }
  const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
  if (!data.boards || typeof data.boards !== 'object') data.boards = {};
  return data;
}

function saveData(guildId, data) {
  const p = dataPath(guildId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function getBoard(data, boardKey) {
  if (!data.boards[boardKey]) {
    data.boards[boardKey] = { users: {}, leaderboardMessage: null };
  }
  return data.boards[boardKey];
}

module.exports = { loadData, saveData, getBoard };
