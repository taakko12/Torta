const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { loadDrops, saveDrops, getDropLeaderboard, getAlltimeLeaderboard, parseLootEmbed, parseLootPlayer } = require('../utils/dropStorage');
const { currentMonth } = require('../utils/plankStorage');

const MEDALS = ['🥇', '🥈', '🥉'];

function formatGp(value) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B gp`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M gp`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K gp`;
  return `${value} gp`;
}

function buildLeaderboardEmbed(entries, title, color) {
  const embed = new EmbedBuilder().setTitle(title).setColor(color).setTimestamp();
  if (entries.length === 0) {
    embed.setDescription('No loot recorded yet.');
  } else {
    const lines = entries.slice(0, 10).map((e, i) => {
      const medal = MEDALS[i] ?? `${i + 1}.`;
      return `${medal} **${e.name}** — ${formatGp(e.total)}`;
    });
    embed.setDescription(lines.join('\n'));
    embed.setFooter({ text: `${entries.length} player${entries.length === 1 ? '' : 's'} recorded` });
  }
  return embed;
}

function isLootEmbed(embed) {
  const text = `${embed.title ?? ''} ${embed.description ?? ''}`;
  return /loot|looted|received a drop|drop:/i.test(text);
}

async function fetchAllMessages(channel) {
  const all = [];
  let lastId = null;
  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;
    const batch = await channel.messages.fetch(options);
    if (batch.size === 0) break;
    const msgs = [...batch.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    all.push(...msgs);
    lastId = batch.sort((a, b) => a.createdTimestamp - b.createdTimestamp).first().id;
    if (batch.size < 100) break;
  }
  return all;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lootboard')
    .setDescription('Loot leaderboard — tracks loot value')
    .addSubcommand(sub => sub
      .setName('show')
      .setDescription('Show the current month loot leaderboard')
    )
    .addSubcommand(sub => sub
      .setName('showall')
      .setDescription('Show the all-time loot leaderboard')
    )
    .addSubcommand(sub => sub
      .setName('setchannel')
      .setDescription('Set the channel to watch for loot notifications')
      .addChannelOption(opt => opt.setName('channel').setDescription('Loot notification channel').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('scrape')
      .setDescription('Scrape entire channel history to build the all-time leaderboard')
    )
    .addSubcommand(sub => sub
      .setName('reset')
      .setDescription('Manually reset the monthly loot leaderboard')
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const data = loadDrops(guildId);

    if (sub === 'show') {
      const entries = getDropLeaderboard(data);
      const [year, month] = currentMonth().split('-');
      const monthName = new Date(year, month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
      return interaction.reply({ embeds: [buildLeaderboardEmbed(entries, `💰 Loot Leaderboard — ${monthName}`, 0xf1c40f)] });
    }

    if (sub === 'showall') {
      const entries = getAlltimeLeaderboard(data);
      return interaction.reply({ embeds: [buildLeaderboardEmbed(entries, '💰 Loot Leaderboard — All Time', 0xe67e22)] });
    }

    // Admin-only below
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ You need Manage Server permission.', flags: 64 });
    }

    if (sub === 'setchannel') {
      const channel = interaction.options.getChannel('channel');
      data.channelId = channel.id;
      saveDrops(guildId, data);
      return interaction.reply({ content: `✅ Now watching ${channel} for loot notifications.`, flags: 64 });
    }

    if (sub === 'reset') {
      data.drops = {};
      data.month = currentMonth();
      saveDrops(guildId, data);
      return interaction.reply({ content: '✅ Monthly loot leaderboard has been reset. All-time totals are unchanged.', flags: 64 });
    }

    if (sub === 'scrape') {
      if (!data.channelId) {
        return interaction.reply({ content: '❌ No loot channel set. Run `/lootboard setchannel` first.', flags: 64 });
      }

      await interaction.deferReply({ flags: 64 });

      const channel = await interaction.client.channels.fetch(data.channelId).catch(() => null);
      if (!channel) {
        return interaction.editReply('❌ Loot channel not found. Run `/lootboard setchannel` again.');
      }

      await interaction.editReply('⏳ Scraping channel history... this may take a while.');

      let messages;
      try {
        messages = await fetchAllMessages(channel);
      } catch (err) {
        console.error(`[lootboard scrape] Failed to fetch messages: ${err.message}`);
        return interaction.editReply('❌ Failed to fetch channel history.');
      }

      const allTime = {};
      let counted = 0;

      for (const msg of messages) {
        if (!msg.webhookId && !msg.author?.bot) continue;
        for (const embed of (msg.embeds ?? [])) {
          if (!isLootEmbed(embed)) continue;
          const name = parseLootPlayer(embed, msg.content);
          const gp = parseLootEmbed(embed);
          if (name && gp > 0) {
            const key = name.toLowerCase();
            allTime[key] = (allTime[key] ?? 0) + gp;
            counted++;
          }
        }
      }

      data.allTime = allTime;
      saveDrops(guildId, data);

      const total = Object.values(allTime).reduce((a, b) => a + b, 0);
      console.log(`[lootboard scrape] ${counted} drops, ${formatGp(total)} total across ${Object.keys(allTime).length} players in guild ${guildId}`);

      return interaction.editReply(
        `✅ Scrape complete! Found **${counted} drops** totalling **${formatGp(total)}** across **${Object.keys(allTime).length} players** from ${messages.length.toLocaleString()} messages.`
      );
    }
  }
};
