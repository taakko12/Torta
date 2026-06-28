const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const {
  getDropsChannelId, setDropsChannel,
  getMonthlyLeaderboard, getAlltimeLeaderboard,
  recordDrop, resetMonthlyDrops,
  parseLootEmbed, parseLootImage, parseLootScreenshot, parseLootPlayer, parseLootItem,
} = require('../utils/dropStorage');
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
      .setDescription('Show monthly and all-time loot leaderboards')
    )
    .addSubcommand(sub => sub
      .setName('setchannel')
      .setDescription('Set the channel to watch for loot notifications')
      .addChannelOption(opt => opt.setName('channel').setDescription('Loot notification channel').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('scrape')
      .setDescription('Scrape full channel history and import all drops (deduplicates automatically)')
    )
    .addSubcommand(sub => sub
      .setName('reset')
      .setDescription('Manually reset the monthly loot leaderboard')
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === 'show') {
      const [monthlyEntries, alltimeEntries] = await Promise.all([
        getMonthlyLeaderboard(guildId),
        getAlltimeLeaderboard(guildId),
      ]);
      const [year, month] = currentMonth().split('-');
      const monthName = new Date(year, month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

      const fmt = (entries) => entries.length === 0
        ? '▬▬▬▬▬▬▬▬▬\n*No loot recorded yet.*'
        : '▬▬▬▬▬▬▬▬▬\n' + entries.slice(0, 10).map((e, i) => `${MEDALS[i] ?? `${i + 1}.`} **${e.name}** — ${formatGp(e.total)}`).join('\n');

      const embed = new EmbedBuilder()
        .setTitle('💰 Loot Leaderboard')
        .setColor(0xf1c40f)
        .addFields(
          { name: `📅 ${monthName}`, value: fmt(monthlyEntries), inline: false },
          { name: '🏆 All Time', value: fmt(alltimeEntries), inline: false },
        )
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // Admin-only below
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ You need Manage Server permission.', flags: 64 });
    }

    if (sub === 'setchannel') {
      const channel = interaction.options.getChannel('channel');
      await setDropsChannel(guildId, channel.id);
      return interaction.reply({ content: `✅ Now watching ${channel} for loot notifications.`, flags: 64 });
    }

    if (sub === 'reset') {
      await resetMonthlyDrops(guildId);
      return interaction.reply({ content: '✅ Monthly loot leaderboard has been reset. All-time totals are unchanged.', flags: 64 });
    }

    if (sub === 'scrape') {
      const channelId = await getDropsChannelId(guildId);
      if (!channelId) {
        return interaction.reply({ content: '❌ No loot channel set. Run `/lootboard setchannel` first.', flags: 64 });
      }

      await interaction.deferReply({ flags: 64 });

      const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
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

      const totals = {};
      const dropRows = [];
      let counted = 0;

      for (const msg of messages) {
        if (!msg.webhookId && !msg.author?.bot) continue;
        let embedIdx = 0;
        for (const embed of (msg.embeds ?? [])) {
          if (isLootEmbed(embed)) {
            const name = parseLootPlayer(embed, msg.content);
            const gp = parseLootEmbed(embed);
            if (name && gp > 0) {
              const key = name.toLowerCase();
              totals[key] = (totals[key] ?? 0) + gp;
              dropRows.push({ ts: msg.createdAt, name, item: parseLootItem(embed), imageUrl: parseLootImage(embed), screenshotUrl: parseLootScreenshot(embed, msg), gp, messageId: msg.id, embedIdx });
              counted++;
            }
          }
          embedIdx++;
        }
      }

      // Insert into DB — dedup index silently skips any already-recorded messages
      for (const row of dropRows) {
        await recordDrop(guildId, row.name, row.gp, row.item, row.imageUrl, row.screenshotUrl, row.messageId, row.embedIdx);
      }

      const total = Object.values(totals).reduce((a, b) => a + b, 0);
      const playerCount = Object.keys(totals).length;

      dropRows.sort((a, b) => a.ts - b.ts);
      const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

      const lines = [
        `Loot Scrape Log — ${new Date().toISOString()}`,
        `Messages scanned : ${messages.length.toLocaleString()}`,
        `Drops found      : ${counted.toLocaleString()}`,
        `Players          : ${playerCount}`,
        `Total value      : ${formatGp(total)}`,
        '',
        '=== ITEMIZED DROPS ===',
        'Timestamp'.padEnd(22) + 'Player'.padEnd(22) + 'Item'.padEnd(40) + 'Value',
        '-'.repeat(100),
        ...dropRows.map(r => {
          const ts = r.ts.toISOString().replace('T', ' ').slice(0, 16);
          return ts.padEnd(22) + r.name.padEnd(22) + r.item.padEnd(40) + formatGp(r.gp);
        }),
        '',
        '=== PLAYER TOTALS ===',
        'Player'.padEnd(30) + 'Total',
        '-'.repeat(50),
        ...sorted.map(([name, gp]) => name.padEnd(30) + formatGp(gp)),
      ];
      const attachment = new AttachmentBuilder(Buffer.from(lines.join('\n'), 'utf8'), { name: 'scrape-log.txt' });

      console.log(`[lootboard scrape] ${counted} drops, ${formatGp(total)} across ${playerCount} players in guild ${guildId}`);

      return interaction.editReply({
        content: `✅ Scrape complete — **${counted} drops**, **${formatGp(total)}**, **${playerCount} players** from ${messages.length.toLocaleString()} messages. All imported (duplicates skipped automatically).`,
        files: [attachment],
      });
    }
  }
};
