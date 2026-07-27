const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { renamePlayer: renameDrops, saveNameChange } = require('../utils/dropStorage');
const { renamePlayer: renamePlanks } = require('../utils/plankStorage');
const { loadLoot, saveLoot } = require('../utils/lootStorage');
const supabase = require('../utils/supabase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('namechange')
    .setDescription('Rename a player RSN across all leaderboard data, combining totals if the new name already exists')
    .addStringOption(opt =>
      opt.setName('oldname').setDescription('Current RSN in the data').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('newname').setDescription('New RSN to rename to').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const oldName = interaction.options.getString('oldname').trim();
    const newName = interaction.options.getString('newname').trim().toLowerCase();

    const changes = [];

    await saveNameChange(guildId, oldName, newName);

    const dropCount = await renameDrops(guildId, oldName, newName);
    if (dropCount > 0) changes.push(`Loot: renamed **${dropCount}** drop record${dropCount === 1 ? '' : 's'} to **${newName}**`);

    const plankCount = await renamePlanks(guildId, oldName, newName);
    if (plankCount > 0) changes.push(`Planks: renamed **${plankCount}** death record${plankCount === 1 ? '' : 's'} to **${newName}**`);

    // Loot review queue is still in JSON — update any pending entries
    const loot = loadLoot(guildId);
    let lootModified = false;
    for (const entry of Object.values(loot.pending ?? {})) {
      if (entry.rsn?.toLowerCase() === oldName.toLowerCase()) {
        entry.rsn = newName;
        lootModified = true;
      }
    }
    if (lootModified) {
      changes.push(`Loot review queue: updated pending entries to **${newName}**`);
      saveLoot(guildId, loot);
    }

    // Update rsn_links if this RSN is linked to a Discord user
    const { data: updated } = await supabase.from('rsn_links')
      .update({ rsn: newName })
      .eq('guild_id', guildId)
      .ilike('rsn', oldName)
      .select('discord_id')
    if (updated?.length) changes.push(`RSN link: updated **${updated.length}** linked Discord account${updated.length === 1 ? '' : 's'} to **${newName}**`);

    // Merge ingame_activity (old RSN → new RSN)
    const { data: oldActivity } = await supabase.from('ingame_activity').select('*').eq('guild_id', guildId).ilike('rsn', oldName).maybeSingle();
    if (oldActivity) {
      const { data: newActivity } = await supabase.from('ingame_activity').select('*').eq('guild_id', guildId).ilike('rsn', newName).maybeSingle();
      if (newActivity) {
        const latestAt = (!oldActivity.last_message_at || (newActivity.last_message_at && newActivity.last_message_at > oldActivity.last_message_at))
          ? newActivity.last_message_at : oldActivity.last_message_at;
        await supabase.from('ingame_activity').update({
          message_count: newActivity.message_count + oldActivity.message_count,
          month_count: newActivity.month_count + oldActivity.month_count,
          last_message_at: latestAt,
        }).eq('guild_id', guildId).ilike('rsn', newName);
        await supabase.from('ingame_activity').delete().eq('guild_id', guildId).ilike('rsn', oldName);
        changes.push(`In-game activity: merged **${oldName}** counts into **${newName}**`);
      } else {
        await supabase.from('ingame_activity').update({ rsn: newName }).eq('guild_id', guildId).ilike('rsn', oldName);
        changes.push(`In-game activity: renamed **${oldName}** → **${newName}**`);
      }
    }

    if (changes.length === 0) {
      return interaction.reply({
        content: `❌ No data found for **${oldName}** in this server.`,
        flags: 64,
      });
    }

    console.log(`[namechange] guild=${guildId} "${oldName}" → "${newName}": ${changes.length} change(s)`);

    return interaction.reply({
      content: `✅ Renamed **${oldName}** → **${newName}**:\n${changes.map(c => `• ${c}`).join('\n')}`,
      flags: 64,
    });
  }
};
