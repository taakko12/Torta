const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { renamePlayer: renameDrops } = require('../utils/dropStorage');
const { renamePlayer: renamePlanks } = require('../utils/plankStorage');
const { loadLoot, saveLoot } = require('../utils/lootStorage');

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
