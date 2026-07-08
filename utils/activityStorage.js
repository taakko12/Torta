const supabase = require('./supabase')

async function logDiscordMessage(guildId, discordId, displayName, roleName = null) {
  await supabase.rpc('log_discord_message', { p_guild: guildId, p_user: discordId, p_name: displayName, p_role: roleName })
}

async function logDiscordMessageAlltime(guildId, discordId, displayName, roleName = null) {
  await supabase.rpc('log_discord_message_alltime', { p_guild: guildId, p_user: discordId, p_name: displayName, p_role: roleName })
}

async function logIngameMessage(guildId, rsn) {
  await supabase.rpc('log_ingame_message', { p_guild: guildId, p_rsn: rsn.toLowerCase() })
}

async function logVcTime(guildId, discordId, displayName, roleName, minutes) {
  await supabase.rpc('log_vc_time', { p_guild: guildId, p_user: discordId, p_name: displayName, p_role: roleName, p_minutes: minutes })
}

module.exports = { logDiscordMessage, logDiscordMessageAlltime, logIngameMessage, logVcTime }
