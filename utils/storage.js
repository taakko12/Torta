const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'wins.json');

function loadData() {
  if (!fs.existsSync(DATA_PATH)) {
    const initial = { boards: {} };
    fs.writeFileSync(DATA_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  const data = JSON.parse(raw);

  // Guard against an old-format file (pre-multi-board) or any corruption
  // where "boards" is missing entirely.
  if (!data.boards || typeof data.boards !== 'object') {
    data.boards = {};
  }

  return data;
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

// Returns the board for a given key (e.g. "sotw", "botw"), creating it
// with empty defaults the first time it's used.
function getBoard(data, boardKey) {
  if (!data.boards[boardKey]) {
    data.boards[boardKey] = { users: {}, leaderboardMessage: null };
  }
  return data.boards[boardKey];
}

module.exports = { loadData, saveData, getBoard };
