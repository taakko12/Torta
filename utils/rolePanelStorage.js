const supabase = require('./supabase');

const DEFAULT = { channelId: null, messageId: null, roles: [] };

async function loadPanel(guildId) {
  const { data } = await supabase.from('guild_config')
    .select('role_panel_config').eq('guild_id', guildId).maybeSingle();
  return data?.role_panel_config ?? { ...DEFAULT };
}

async function savePanel(guildId, panel) {
  await supabase.from('guild_config').upsert(
    { guild_id: guildId, role_panel_config: panel },
    { onConflict: 'guild_id' }
  );
}

module.exports = { loadPanel, savePanel };
