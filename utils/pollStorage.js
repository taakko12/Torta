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

module.exports = { createPoll, getPollByMessageId, updatePoll, getExpiredPolls };
