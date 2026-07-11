const { EmbedBuilder } = require('discord.js');
const supabase = require('./supabase');
const SITE = process.env.WEBSITE_URL || 'https://tortapounders.vercel.app';

async function recordDeposit(guildId, player, gp, action) {
  const { error } = await supabase.from('coffer_deposits').insert({ guild_id: guildId, player, gp, action });
  if (error) console.error('[coffer] insert failed:', error.message);
}

async function getLeaderboard(guildId) {
  const { data } = await supabase.from('coffer_deposits').select('player, gp, action').eq('guild_id', guildId);
  const totals = {};
  for (const row of data ?? []) {
    if (!totals[row.player]) totals[row.player] = { player: row.player, net: 0, deposited: 0 };
    if (row.action === 'deposited') { totals[row.player].net += Number(row.gp); totals[row.player].deposited += Number(row.gp); }
    else totals[row.player].net -= Number(row.gp);
  }
  return Object.values(totals).sort((a, b) => b.net - a.net);
}

const MEDALS = ['🥇', '🥈', '🥉'];

function buildCofferEmbed(leaderboard) {
  const top = leaderboard.filter(e => e.net > 0).slice(0, 10);
  const description = top.length === 0
    ? 'No coffer donations yet.'
    : top.map((e, i) => `${MEDALS[i] ?? `${i + 1}.`} **${e.player}** — ${e.net.toLocaleString()} gp`).join('\n');
  return new EmbedBuilder()
    .setTitle('🏦 Clan Coffer Leaderboard')
    .setURL(`${SITE}/admin/coffer`)
    .setDescription(description)
    .setColor(0xF39C12)
    .setTimestamp()
    .setFooter({ text: 'Updates automatically with each donation' });
}

async function updateLeaderboardEmbed(client, guildId) {
  const { data: config } = await supabase.from('guild_config')
    .select('coffer_leaderboard_channel_id, coffer_leaderboard_message_id')
    .eq('guild_id', guildId).maybeSingle();
  if (!config?.coffer_leaderboard_channel_id || !config?.coffer_leaderboard_message_id) return;
  const leaderboard = await getLeaderboard(guildId);
  try {
    const channel = await client.channels.fetch(config.coffer_leaderboard_channel_id);
    if (!channel) return;
    const msg = await channel.messages.fetch(config.coffer_leaderboard_message_id);
    await msg.edit({ embeds: [buildCofferEmbed(leaderboard)] });
  } catch (err) {
    console.error('[coffer] leaderboard embed update failed:', err.message);
  }
}

module.exports = { recordDeposit, getLeaderboard, buildCofferEmbed, updateLeaderboardEmbed };
