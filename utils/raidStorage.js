const supabase = require('./supabase');

async function getRaid(raidId) {
  const { data } = await supabase.from('raids').select('*').eq('id', raidId).maybeSingle();
  if (!data) return null;
  return toCamel(data);
}

async function createRaid(raid) {
  const { error } = await supabase.from('raids').insert({
    id: raid.id,
    guild_id: raid.guildId,
    name: raid.name,
    timestamp: raid.timestamp,
    description: raid.description ?? null,
    channel_id: raid.channelId ?? null,
    message_id: raid.messageId ?? null,
    signups: raid.signups ?? [],
    attendees: raid.attendees ?? null,
    reminded_24h: false,
    reminded_1h: false,
  });
  if (error) throw error;
}

async function updateRaid(raidId, patch) {
  const row = {};
  if ('signups' in patch) row.signups = patch.signups;
  if ('attendees' in patch) row.attendees = patch.attendees;
  if ('reminded24h' in patch) row.reminded_24h = patch.reminded24h;
  if ('reminded1h' in patch) row.reminded_1h = patch.reminded1h;
  if ('messageId' in patch) row.message_id = patch.messageId;
  await supabase.from('raids').update(row).eq('id', raidId);
}

async function getUpcomingRaids() {
  const now = Math.floor(Date.now() / 1000);
  const { data } = await supabase.from('raids')
    .select('*').gt('timestamp', now).is('attendees', null);
  return (data ?? []).map(toCamel);
}

function toCamel(r) {
  return {
    id: r.id, guildId: r.guild_id, name: r.name, timestamp: r.timestamp,
    description: r.description, channelId: r.channel_id, messageId: r.message_id,
    signups: r.signups ?? [], attendees: r.attendees ?? null,
    reminded24h: r.reminded_24h, reminded1h: r.reminded_1h,
  };
}

module.exports = { getRaid, createRaid, updateRaid, getUpcomingRaids };
