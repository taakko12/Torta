const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadRaids } = require('../utils/raidStorage');
const { getCurrentSkillCompetition, getCurrentBossCompetition } = require('../utils/wom');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('events')
    .setDescription('Show upcoming raids and active WOM competitions'),

  async execute(interaction) {
    await interaction.deferReply();

    const guildId = interaction.guildId;
    const now = Math.floor(Date.now() / 1000);

    // Upcoming raids
    const raidsData = loadRaids(guildId);
    const upcoming = Object.values(raidsData.raids)
      .filter(r => r.timestamp > now && !r.attendees)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, 5);

    const embed = new EmbedBuilder()
      .setTitle('📅 Upcoming Events')
      .setColor(0x5865f2)
      .setTimestamp();

    // Raids section
    if (upcoming.length > 0) {
      const raidLines = upcoming.map(r => {
        const signupCount = r.signups?.length ?? 0;
        return `**${r.name}** — <t:${r.timestamp}:F> (<t:${r.timestamp}:R>)\n> ${signupCount} signed up`;
      });
      embed.addFields({ name: '⚔️ Raids', value: raidLines.join('\n\n'), inline: false });
    } else {
      embed.addFields({ name: '⚔️ Raids', value: '*No upcoming raids scheduled.*', inline: false });
    }

    // WOM competitions
    try {
      const [sotw, botw] = await Promise.all([
        getCurrentSkillCompetition().catch(() => null),
        getCurrentBossCompetition().catch(() => null)
      ]);

      const compLines = [];
      if (sotw) {
        compLines.push(`**SOTW: ${sotw.metric.toUpperCase()}**\nEnds <t:${Math.floor(new Date(sotw.endsAt).getTime() / 1000)}:R>`);
      }
      if (botw) {
        compLines.push(`**BOTW: ${botw.metric.toUpperCase()}**\nEnds <t:${Math.floor(new Date(botw.endsAt).getTime() / 1000)}:R>`);
      }

      if (compLines.length > 0) {
        embed.addFields({ name: '🏆 WOM Competitions', value: compLines.join('\n\n'), inline: false });
      } else {
        embed.addFields({ name: '🏆 WOM Competitions', value: '*No active competitions found.*', inline: false });
      }
    } catch (err) {
      console.error(`[events] Failed to fetch WOM competitions: ${err.message}`);
      embed.addFields({ name: '🏆 WOM Competitions', value: '*Failed to fetch WOM data.*', inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  }
};
