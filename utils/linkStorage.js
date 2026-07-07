const supabase = require('./supabase')

async function getLink(discordId, guildId) {
  const { data } = await supabase.from('rsn_links').select('rsn').eq('discord_id', discordId).eq('guild_id', guildId).maybeSingle()
  return data?.rsn ?? null
}

async function setLink(discordId, guildId, rsn) {
  await supabase.from('rsn_links').upsert({ discord_id: discordId, guild_id: guildId, rsn: rsn.toLowerCase(), linked_at: new Date().toISOString() }, { onConflict: 'discord_id,guild_id' })
}

module.exports = { getLink, setLink }
