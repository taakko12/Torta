const fs = require('fs');
const path = require('path');
const supabase = require('./supabase');

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

async function setPollChannelId(guildId, channelId) {
  await supabase.from('guild_config').upsert(
    { guild_id: guildId, poll_channel_id: channelId },
    { onConflict: 'guild_id' }
  );
}

module.exports = { loadData, saveData, getBoard, setPollChannelId };
