const supabase = require('./supabase');
const fs = require('fs');
const path = require('path');

function pendingPath(guildId) {
  const dir = path.join(__dirname, '..', 'data', guildId);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'welcome_pending.json');
}

function loadPendingJson(guildId) {
  try { return JSON.parse(fs.readFileSync(pendingPath(guildId), 'utf8')); } catch { return {}; }
}

function savePendingJson(guildId, pending) {
  fs.writeFileSync(pendingPath(guildId), JSON.stringify(pending));
}

async function loadWelcome(guildId) {
  const { data } = await supabase.from('guild_config')
    .select('welcome_role_id, welcome_mod_channel_id, welcome_channel_id, welcome_message_id')
    .eq('guild_id', guildId).maybeSingle();
  return {
    roleId: data?.welcome_role_id ?? null,
    modChannelId: data?.welcome_mod_channel_id ?? null,
    channelId: data?.welcome_channel_id ?? null,
    messageId: data?.welcome_message_id ?? null,
    pending: loadPendingJson(guildId),
  };
}

async function saveWelcome(guildId, config) {
  await supabase.from('guild_config').upsert({
    guild_id: guildId,
    welcome_role_id: config.roleId ?? null,
    welcome_mod_channel_id: config.modChannelId ?? null,
    welcome_channel_id: config.channelId ?? null,
    welcome_message_id: config.messageId ?? null,
  }, { onConflict: 'guild_id' });
  savePendingJson(guildId, config.pending ?? {});
}

function addWelcomePending(guildId, data, messageId, entry) {
  data.pending[messageId] = entry;
  savePendingJson(guildId, data.pending);
}

function resolveWelcomePending(guildId, data, messageId) {
  const entry = data.pending[messageId] ?? null;
  delete data.pending[messageId];
  savePendingJson(guildId, data.pending);
  return entry;
}

module.exports = { loadWelcome, saveWelcome, addWelcomePending, resolveWelcomePending };
