const supabase = require('./supabase');
const fs = require('fs');
const path = require('path');

function pendingPath(guildId) {
  const dir = path.join(__dirname, '..', 'data', guildId);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'loot_pending.json');
}

function loadPendingJson(guildId) {
  try { return JSON.parse(fs.readFileSync(pendingPath(guildId), 'utf8')); } catch { return {}; }
}

function savePendingJson(guildId, pending) {
  fs.writeFileSync(pendingPath(guildId), JSON.stringify(pending));
}

async function loadLoot(guildId) {
  const { data } = await supabase.from('guild_config')
    .select('lootsubmit_channel_id').eq('guild_id', guildId).maybeSingle();
  return { reviewChannelId: data?.lootsubmit_channel_id ?? null, pending: loadPendingJson(guildId) };
}

async function saveLoot(guildId, data) {
  await supabase.from('guild_config').upsert(
    { guild_id: guildId, lootsubmit_channel_id: data.reviewChannelId ?? null },
    { onConflict: 'guild_id' }
  );
  savePendingJson(guildId, data.pending ?? {});
}

function addPending(guildId, data, messageId, entry) {
  data.pending[messageId] = entry;
  savePendingJson(guildId, data.pending);
}

function resolvePending(guildId, data, messageId) {
  const entry = data.pending[messageId] ?? null;
  delete data.pending[messageId];
  savePendingJson(guildId, data.pending);
  return entry;
}

module.exports = { loadLoot, saveLoot, addPending, resolvePending };
