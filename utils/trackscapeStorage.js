const supabase = require('./supabase');
const crypto = require('crypto');

async function loadTrackscape(guildId) {
  const { data } = await supabase
    .from('guild_config')
    .select('trackscape_code, clanchat_channel_id, broadcast_channel_id')
    .eq('guild_id', guildId)
    .maybeSingle();
  return {
    verificationCode: data?.trackscape_code ?? null,
    clanChatChannelId: data?.clanchat_channel_id ?? null,
    broadcastChannelId: data?.broadcast_channel_id ?? null,
  };
}

async function saveTrackscape(guildId, config) {
  const { error } = await supabase
    .from('guild_config')
    .upsert({
      guild_id: guildId,
      trackscape_code: config.verificationCode,
      clanchat_channel_id: config.clanChatChannelId,
      broadcast_channel_id: config.broadcastChannelId,
    }, { onConflict: 'guild_id' });
  if (error) throw error;
}

function generateCode() {
  return crypto.randomBytes(6).toString('hex');
}

async function findGuildByCode(code) {
  const { data } = await supabase
    .from('guild_config')
    .select('guild_id, trackscape_code, clanchat_channel_id, broadcast_channel_id')
    .eq('trackscape_code', code)
    .maybeSingle();
  if (!data) return null;
  return {
    guildId: data.guild_id,
    verificationCode: data.trackscape_code,
    clanChatChannelId: data.clanchat_channel_id,
    broadcastChannelId: data.broadcast_channel_id,
  };
}

module.exports = { loadTrackscape, saveTrackscape, generateCode, findGuildByCode };
