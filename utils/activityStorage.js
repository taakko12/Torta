const supabase = require('./supabase')

async function logDiscordMessage(guildId, discordId, displayName, roleName = null) {
  await supabase.rpc('log_discord_message', { p_guild: guildId, p_user: discordId, p_name: displayName, p_role: roleName })
}

async function logIngameMessage(guildId, rsn) {
  await supabase.rpc('log_ingame_message', { p_guild: guildId, p_rsn: rsn.toLowerCase() })
}

module.exports = { logDiscordMessage, logIngameMessage }
