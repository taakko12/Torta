const supabase = require('./supabase');

// ── Channel config ───────────────────────────────────────────────────────────

async function getPlanksChannelId(guildId) {
  const { data } = await supabase
    .from('guild_config')
    .select('planks_channel_id')
    .eq('guild_id', guildId)
    .maybeSingle();
  return data?.planks_channel_id ?? null;
}

async function setPlanksChannel(guildId, channelId) {
  const { error } = await supabase
    .from('guild_config')
    .upsert({ guild_id: guildId, planks_channel_id: channelId }, { onConflict: 'guild_id' });
  if (error) throw error;
}

// ── Write ────────────────────────────────────────────────────────────────────

async function recordDeath(guildId, playerName, messageId = null, imageUrl = null) {
  // Dedup across sources (Dink + TrackScape plugin): skip if this player
  // already has a death recorded in the last 5 minutes for this guild.
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from('planks')
    .select('id')
    .eq('guild_id', guildId)
    .ilike('player_name', playerName)
    .gte('recorded_at', since)
    .limit(1)
    .maybeSingle();
  if (recent) return;

  const { error } = await supabase.from('planks').insert({
    guild_id: guildId,
    player_name: playerName.toLowerCase(),
    discord_message_id: messageId,
    image_url: imageUrl,
  });
  if (error) {
    if (error.code !== '23505') throw error;
    // Backfill image_url if we now have one and it was missing
    if (imageUrl && messageId != null) {
      await supabase.from('planks')
        .update({ image_url: imageUrl })
        .eq('guild_id', guildId)
        .eq('discord_message_id', messageId)
        .is('image_url', null);
    }
  }
}

// ── Read ─────────────────────────────────────────────────────────────────────

async function getMonthlyLeaderboard(guildId) {
  const { data, error } = await supabase.rpc('monthly_plank_leaderboard', { p_guild_id: guildId });
  if (error) throw error;
  return (data ?? []).map(r => ({ name: r.player_name, count: Number(r.count) }));
}

async function getAlltimeLeaderboard(guildId) {
  const { data, error } = await supabase.rpc('alltime_plank_leaderboard', { p_guild_id: guildId });
  if (error) throw error;
  return (data ?? []).map(r => ({ name: r.player_name, count: Number(r.count) }));
}

async function getMostRecentPlank(guildId) {
  const { data } = await supabase
    .from('planks')
    .select('player_name, image_url, recorded_at')
    .eq('guild_id', guildId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

// ── Admin ────────────────────────────────────────────────────────────────────

async function renamePlayer(guildId, oldName, newName) {
  const { count } = await supabase
    .from('planks')
    .select('*', { count: 'exact', head: true })
    .eq('guild_id', guildId)
    .ilike('player_name', oldName);
  if (!count) return 0;

  const { error } = await supabase
    .from('planks')
    .update({ player_name: newName.toLowerCase() })
    .eq('guild_id', guildId)
    .ilike('player_name', oldName);
  if (error) throw error;
  return count;
}

async function resetMonthlyPlanks(guildId) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { error } = await supabase
    .from('planks')
    .delete()
    .eq('guild_id', guildId)
    .gte('recorded_at', monthStart);
  if (error) throw error;
}

// ── Utility ───────────────────────────────────────────────────────────────────

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

module.exports = {
  getPlanksChannelId,
  setPlanksChannel,
  recordDeath,
  getMonthlyLeaderboard,
  getAlltimeLeaderboard,
  getMostRecentPlank,
  renamePlayer,
  resetMonthlyPlanks,
  currentMonth,
};
