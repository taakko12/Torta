const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getPlayerStats, getPlayerMonthlyGp } = require('../utils/dropStorage');
const { getPlayerDeaths } = require('../utils/plankStorage');
const { getRecentAchievements } = require('../utils/achievementStorage');
const { womGet } = require('../utils/womClient');

function fmt(n) { return n == null ? 'N/A' : n.toLocaleString('en-US'); }
function fmtGp(n) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B gp`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M gp`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K gp`;
  return `${n} gp`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View clan stats for a player')
    .addStringOption(opt => opt.setName('rsn').setDescription('In-game username').setRequired(true)),

  async execute(interaction) {
    const rsn = interaction.options.getString('rsn');
    const guildId = interaction.guildId;
    await interaction.deferReply();

    const [dropStats, monthlyGp, deaths, achievements, wom] = await Promise.allSettled([
      getPlayerStats(guildId, rsn),
      getPlayerMonthlyGp(guildId, rsn),
      getPlayerDeaths(guildId, rsn),
      getRecentAchievements(guildId, { limit: 3, player: rsn }),
      womGet(`/players/${encodeURIComponent(rsn)}`),
    ]);

    const drops = dropStats.status === 'fulfilled' ? dropStats.value : null;
    const monthly = monthlyGp.status === 'fulfilled' ? monthlyGp.value : 0;
    const dead = deaths.status === 'fulfilled' ? deaths.value : { total: 0, monthly: 0 };
    const ach = achievements.status === 'fulfilled' ? achievements.value : [];
    const player = wom.status === 'fulfilled' ? wom.value : null;

    const displayName = drops?.displayName ?? player?.displayName ?? rsn;

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${displayName}`)
      .setColor(0xc89b3c);

    // WOM row
    if (player?.latestSnapshot) {
      const skills = player.latestSnapshot.data?.skills;
      const computed = player.latestSnapshot.data?.computed;
      embed.addFields({
        name: '🌍 WOM',
        value: [
          `Total Level: **${skills?.overall?.level ?? 'N/A'}**`,
          `EHP: **${computed?.ehp?.value != null ? fmt(Math.round(computed.ehp.value)) : 'N/A'}**`,
          `EHB: **${computed?.ehb?.value != null ? fmt(Math.round(computed.ehb.value)) : 'N/A'}**`,
        ].join('  ·  '),
        inline: false,
      });
    }

    // Loot
    embed.addFields({
      name: '💰 Loot',
      value: `All time: **${drops ? fmtGp(drops.totalGp) : 'N/A'}** (${drops?.dropCount ?? 0} drops)  ·  This month: **${fmtGp(monthly)}**`,
      inline: false,
    });

    // Top drops
    if (drops?.topDrops?.length) {
      embed.addFields({
        name: '🏆 Top Drops',
        value: drops.topDrops.map((d, i) =>
          `${['🥇','🥈','🥉'][i]} ${d.item_name ?? 'Unknown'} — ${fmtGp(Number(d.gp_value))}`
        ).join('\n'),
        inline: false,
      });
    }

    // Deaths
    embed.addFields({
      name: '💀 Deaths',
      value: `All time: **${fmt(dead.total)}**  ·  This month: **${fmt(dead.monthly)}**`,
      inline: false,
    });

    // Recent achievements
    if (ach.length) {
      embed.addFields({
        name: '🏅 Recent Achievements',
        value: ach.map(a => `${a.title} — ${a.description}`).join('\n'),
        inline: false,
      });
    }

    return interaction.editReply({ embeds: [embed] });
  },
};
