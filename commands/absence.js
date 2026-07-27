const { SlashCommandBuilder } = require('discord.js');
const supabase = require('../utils/supabase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('absence')
    .setDescription('Log or end an absence')
    .addSubcommand(sub => sub
      .setName('start')
      .setDescription('Log that you are going on a break')
      .addStringOption(opt => opt.setName('reason').setDescription('Reason for absence').setRequired(false))
      .addStringOption(opt => opt.setName('return').setDescription('Expected return date (YYYY-MM-DD)').setRequired(false))
    )
    .addSubcommand(sub => sub
      .setName('end')
      .setDescription('Mark yourself as returned')
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const discordId = interaction.user.id;
    const displayName = interaction.member?.displayName ?? interaction.user.username;
    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      const reason = interaction.options.getString('reason') ?? null;
      const returnDate = interaction.options.getString('return') ?? null;

      // End any existing absence first
      await supabase.from('absences')
        .update({ returned_at: new Date().toISOString() })
        .eq('guild_id', guildId).eq('discord_id', discordId).is('returned_at', null);

      const { error } = await supabase.from('absences').insert({
        guild_id: guildId,
        discord_id: discordId,
        display_name: displayName,
        reason,
        return_date: returnDate,
      });

      if (error) return interaction.reply({ content: '❌ Failed to log absence. Try again.', flags: 64 });

      const parts = ['✅ Absence logged.'];
      if (reason) parts.push(`**Reason:** ${reason}`);
      if (returnDate) parts.push(`**Expected return:** ${returnDate}`);
      parts.push("You won't be flagged as inactive while on break.");
      return interaction.reply({ content: parts.join('\n'), flags: 64 });
    }

    if (sub === 'end') {
      const { data } = await supabase.from('absences')
        .update({ returned_at: new Date().toISOString() })
        .eq('guild_id', guildId).eq('discord_id', discordId).is('returned_at', null)
        .select();

      if (!data?.length) return interaction.reply({ content: "You don't have an active absence logged.", flags: 64 });
      return interaction.reply({ content: '✅ Welcome back! Absence marked as ended.', flags: 64 });
    }
  }
};
