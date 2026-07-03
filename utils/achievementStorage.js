const supabase = require('./supabase');

async function recordAchievement(guildId, player, title, description, messageId = null, embedIndex = 0, timestamp = null) {
  const row = { guild_id: guildId, player_name: player, title, description, discord_message_id: messageId, embed_index: embedIndex };
  if (timestamp) row.recorded_at = timestamp instanceof Date ? timestamp.toISOString() : timestamp;
  const { error } = await supabase.from('achievements').insert(row);
  if (error && error.code !== '23505') throw error;
}

async function getRecentAchievements(guildId, { limit = 20, player = null } = {}) {
  let q = supabase.from('achievements').select('*')
    .eq('guild_id', guildId).order('recorded_at', { ascending: false }).limit(limit);
  if (player) q = q.ilike('player_name', player);
  const { data } = await q;
  return data ?? [];
}

module.exports = { recordAchievement, getRecentAchievements };
