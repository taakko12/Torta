const supabase = require('./supabase');

async function createPoll(pollData) {
  const { error } = await supabase.from('active_polls').insert(pollData);
  if (error) throw error;
}

async function getPollByMessageId(messageId) {
  const { data } = await supabase
    .from('active_polls')
    .select('*')
    .eq('message_id', messageId)
    .maybeSingle();
  return data ?? null;
}

async function updatePoll(pollId, patch) {
  const { error } = await supabase.from('active_polls').update(patch).eq('id', pollId);
  if (error) throw error;
}

async function getExpiredPolls() {
  const { data } = await supabase
    .from('active_polls')
    .select('*')
    .lte('voting_cutoff', new Date().toISOString());
  return data ?? [];
}

async function getRecentPicks(guildId, pollType, limit = 10) {
  const { data } = await supabase
    .from('comp_picks')
    .select('metric')
    .eq('guild_id', guildId)
    .eq('poll_type', pollType)
    .order('picked_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map(r => r.metric).reverse(); // oldest-first for rollCandidates
}

async function getRecentPicksWithDates(guildId, pollType, limit = 10) {
  const { data } = await supabase
    .from('comp_picks')
    .select('metric, picked_at')
    .eq('guild_id', guildId)
    .eq('poll_type', pollType)
    .order('picked_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

async function insertPick(guildId, pollType, metric) {
  const { error } = await supabase.from('comp_picks').insert({ guild_id: guildId, poll_type: pollType, metric });
  if (error) console.error(`[comp_picks] insert failed (${pollType} ${metric}):`, error.message);
}

async function deleteMostRecentPick(guildId, pollType, metric) {
  const { data } = await supabase.from('comp_picks').select('id')
    .eq('guild_id', guildId).eq('poll_type', pollType).eq('metric', metric)
    .order('picked_at', { ascending: false }).limit(1);
  if (!data?.length) return false;
  await supabase.from('comp_picks').delete().eq('id', data[0].id);
  return true;
}

module.exports = { createPoll, getPollByMessageId, updatePoll, getExpiredPolls, getRecentPicks, getRecentPicksWithDates, insertPick, deleteMostRecentPick };
