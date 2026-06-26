const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getCurrentSkillCompetition, getCompetitionStandings } = require('../utils/wom');
const { buildCompetitionEmbed, humanize, formatNumber } = require('../utils/womEmbeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sotwstats')
    .setDescription("Show this week's Skill of the Week standings — full leaderboard or a specific player")
    .addStringOption(opt =>
      opt.setName('username').setDescription('OSRS username to look up (omit for top 3)')
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const username = interaction.options.getString('username');

    try {
      const competition = await getCurrentSkillCompetition();

      if (!competition) {
        await interaction.editReply('📭 No active Skill of the Week competition right now.');
        return;
      }

      const standings = await getCompetitionStandings(competition.id);

      if (username) {
        const entry = standings.participations?.find(
          p => p.player.username.toLowerCase() === username.toLowerCase()
        );

        if (!entry) {
          await interaction.editReply(`❌ **${username}** is not a participant in the current SOTW competition.`);
          return;
        }

        const gained = entry.progress.gained;
        const embed = new EmbedBuilder()
          .setTitle(`📅 SOTW — ${entry.player.displayName}`)
          .setColor(0x57f287)
          .setDescription(`**${humanize(competition.metric)}** — ends <t:${Math.floor(new Date(competition.endsAt).getTime() / 1000)}:R>`)
          .addFields({ name: 'XP Gained', value: `${formatNumber(gained)} xp` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({ embeds: [buildCompetitionEmbed(competition, standings, { color: 0x57f287, unit: 'xp' })] });
      }
    } catch (err) {
      console.error(`[sotwstats] ${err.message}`);
      await interaction.editReply('❌ Could not fetch Skill of the Week data from Wise Old Man. Try again in a bit.');
    }
  }
};
