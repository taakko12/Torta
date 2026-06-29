const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getCurrentBossCompetitions, getCompetitionStandings } = require('../utils/wom');
const { humanize, formatNumber } = require('../utils/womEmbeds');
const { MEDALS } = require('../utils/constants');

// Merge participations from 1–2 competitions, summing KC per player.
function mergeStandings(competitions) {
  const byPlayer = new Map();
  for (const comp of competitions) {
    for (const p of comp.participations ?? []) {
      const key = p.player.username.toLowerCase();
      if (!byPlayer.has(key)) {
        byPlayer.set(key, { player: p.player, gained: 0 });
      }
      byPlayer.get(key).gained += p.progress.gained;
    }
  }
  return [...byPlayer.values()].sort((a, b) => b.gained - a.gained);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('botwstats')
    .setDescription("Show this week's Boss of the Week standings — full leaderboard or a specific player")
    .addStringOption(opt =>
      opt.setName('username').setDescription('OSRS username to look up (omit for top 3)')
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const username = interaction.options.getString('username');

    try {
      const competitions = await getCurrentBossCompetitions();

      if (competitions.length === 0) {
        await interaction.editReply('📭 No active Boss of the Week competition right now.');
        return;
      }

      const standings = await Promise.all(competitions.map(c => getCompetitionStandings(c.id)));
      const merged = mergeStandings(standings);

      // Build a display title — if two comps, show both boss names
      const bossLabel = standings.length > 1
        ? standings.map(s => humanize(s.metric)).join(' + ')
        : humanize(standings[0].metric);

      const endsAt = competitions[0].endsAt;
      const endsTs = Math.floor(new Date(endsAt).getTime() / 1000);

      if (username) {
        const entry = merged.find(e => e.player.username.toLowerCase() === username.toLowerCase());
        if (!entry) {
          await interaction.editReply(`❌ **${username}** is not a participant in the current BOTW competition.`);
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle(`📅 BOTW — ${entry.player.displayName}`)
          .setColor(0xed4245)
          .setDescription(`**${bossLabel}** — ends <t:${endsTs}:R>`)
          .addFields({ name: 'KC Gained', value: `${formatNumber(entry.gained)} kc` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        const top = merged.filter(e => e.gained > 0).slice(0, 3);

        const embed = new EmbedBuilder()
          .setTitle(`📅 Boss of the Week`)
          .setColor(0xed4245)
          .setDescription(`**${bossLabel}** — ends <t:${endsTs}:R>`)
          .setTimestamp();

        if (top.length === 0) {
          embed.addFields({ name: 'Standings', value: 'No progress recorded yet.' });
        } else {
          const lines = top.map((e, i) =>
            `${MEDALS[i] ?? `${i + 1}.`} **${e.player.displayName}** — ${formatNumber(e.gained)} kc gained`
          );
          embed.addFields({ name: 'Top 3', value: lines.join('\n') });
        }

        if (standings.length > 1) {
          embed.setFooter({ text: 'KC combined across both variants' });
        }

        await interaction.editReply({ embeds: [embed] });
      }
    } catch (err) {
      console.error(`[botwstats] ${err.message}`);
      await interaction.editReply('❌ Could not fetch Boss of the Week data from Wise Old Man. Try again in a bit.');
    }
  }
};
