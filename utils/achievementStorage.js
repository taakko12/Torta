const { supabase } = require('./supabase');

async function recordAchievement(guildId, player, title, description, messageId = null, embedIndex = 0) {
  const { error } = await supabase.from('achievements').insert({
    guild_id: guildId,
    player_name: player,
    title,
    description,
    discord_message_id: messageId,
    embed_index: embedIndex,
  });
  if (error && error.code !== '23505') throw error;
}

async function getRecentAchievements(guildId, limit = 20) {
  const { data } = await supabase
    .from('achievements')
    .select('*')
    .eq('guild_id', guildId)
    .order('recorded_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

module.exports = { recordAchievement, getRecentAchievements };
