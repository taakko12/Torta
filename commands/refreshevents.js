const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const supabase = require('../utils/supabase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('refreshevents')
    .setDescription('Re-sync all event embeds with current RSVP list')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const { data: events } = await supabase
      .from('clan_events')
      .select('id, channel_id, message_id, title, description, event_type, scheduled_at')
      .eq('guild_id', interaction.guildId)
      .not('message_id', 'is', null);

    if (!events?.length) return interaction.editReply('No events with Discord embeds found.');

    let updated = 0;
    for (const event of events) {
      const { data: rsvps } = await supabase.from('event_rsvps').select('display_name').eq('event_id', event.id).order('rsvped_at');
      const names = (rsvps ?? []).map(r => r.display_name).filter(Boolean);

      const ch = await interaction.client.channels.fetch(event.channel_id).catch(() => null);
      if (!ch) continue;
      const msg = await ch.messages.fetch(event.message_id).catch(() => null);
      if (!msg) continue;

      const ts = event.scheduled_at ? Math.floor(new Date(event.scheduled_at).getTime() / 1000) : null;
      const dateStr = ts ? `<t:${ts}:F> (<t:${ts}:R>)` : 'TBD';
      const fields = [
        { name: 'When', value: dateStr, inline: true },
        { name: 'Type', value: event.event_type || 'Event', inline: true },
      ];
      if (names.length > 0) fields.push({ name: `✅ Going (${names.length})`, value: names.join(', ') });

      await msg.edit({
        embeds: [{ title: `📅 ${event.title}`, description: event.description || undefined, color: 0x7c5ce8, fields, footer: { text: 'Click below to RSVP' } }],
      }).catch(() => {});
      updated++;
    }

    return interaction.editReply(`Updated ${updated}/${events.length} event embed${updated !== 1 ? 's' : ''}.`);
  },
};
