const supabase = require('./supabase');

async function loadData(guildId) {
  const { data: row } = await supabase.from('guild_data').select('data').eq('guild_id', guildId).single();
  const data = row?.data ?? {};
  if (!data.boards || typeof data.boards !== 'object') data.boards = {};
  return data;
}

async function saveData(guildId, data) {
  await supabase.from('guild_data').upsert({ guild_id: guildId, data }, { onConflict: 'guild_id' });
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
