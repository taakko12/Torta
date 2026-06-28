const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const {
  getDropsChannelId, setDropsChannel,
  getMonthlyLeaderboard, getAlltimeLeaderboard,
  recordDrop, resetMonthlyDrops, getPlayerStats,
  getNameChangeMap, resolveNameFromMap,
  parseLootEmbed, parseLootImage, parseLootScreenshot, parseLootPlayer, parseLootItem,
} = require('../utils/dropStorage');
const { loadTrackscape } = require('../utils/trackscapeStorage');
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

function dateToSnowflake(date) {
  return ((BigInt(date.getTime()) - 1420070400000n) << 22n).toString();
}

async function fetchAllMessages(channel, afterSnowflake = null) {
  const all = [];
  if (afterSnowflake) {
    let lastId = afterSnowflake;
    while (true) {
      const batch = await channel.messages.fetch({ limit: 100, after: lastId });
      if (batch.size === 0) break;
      const msgs = [...batch.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      all.push(...msgs);
      lastId = msgs[msgs.length - 1].id;
      if (batch.size < 100) break;
    }
  } else {
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
  }
  return all;
}

function parseBroadcastDropEmbed(embed) {
  const title = embed.title ?? '';
  const desc = embed.description ?? '';
  const parseVal = s => s ? parseInt(s.replace(/[,\s]/g, ''), 10) || null : null;

  if (title.includes('Raid Drop')) {
    const m = desc.match(/^\*\*(.+?)\*\* received \*\*(.+?)\*\*(?:\s*\(([,\d]+) coins\))?/);
    if (!m) return null;
    return { player: m[1], item: m[2], value: parseVal(m[3]) };
  }
  if (title === '💰 Drop') {
    const m = desc.match(/^\*\*(.+?)\*\* received a drop: (?:\d+x )?\*\*(.+?)\*\*(?:\s*\(([,\d]+) coins\))?/);
    if (!m) return null;
    return { player: m[1], item: m[2], value: parseVal(m[3]) };
  }
  if (title.includes('Clue Item')) {
    const m = desc.match(/^\*\*(.+?)\*\* received a clue item: \*\*(.+?)\*\*(?:\s*\(([,\d]+) coins\))?/);
    if (!m) return null;
    return { player: m[1], item: m[2], value: parseVal(m[3]) };
  }
  return null;
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
      .setDescription('Scrape channel history and import drops (deduplicates automatically)')
      .addStringOption(opt => opt
        .setName('period')
        .setDescription('How far back to scan (default: all time)')
        .addChoices(
          { name: 'Last 24 hours', value: '1d' },
          { name: 'Last 7 days',   value: '7d' },
          { name: 'Last 30 days',  value: '30d' },
          { name: 'All time',      value: 'all' },
        )
      )
    )
    .addSubcommand(sub => sub
      .setName('search')
      .setDescription('Look up a player\'s top drops and total loot')
      .addStringOption(opt => opt
        .setName('rsn')
        .setDescription('RuneScape name to look up')
        .setRequired(true)
      )
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

      const fmt = (label, entries) => {
        const rows = entries.length === 0
          ? '*No loot recorded yet.*'
          : entries.slice(0, 10).map((e, i) => `${MEDALS[i] ?? `${i + 1}.`} **${e.name}** — ${formatGp(e.total)}`).join('\n');
        return `▬▬▬▬▬▬▬▬▬\n${label}\n${rows}`;
      };

      const embed = new EmbedBuilder()
        .setTitle('💰 Loot Leaderboard')
        .setColor(0xf1c40f)
        .setDescription(
          fmt(`📅 ${monthName}`, monthlyEntries) +
          '\n\n' +
          fmt('🏆 All Time', alltimeEntries)
        )
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'search') {
      const rsn = interaction.options.getString('rsn');
      const stats = await getPlayerStats(guildId, rsn);

      if (stats.dropCount === 0) {
        return interaction.reply({ content: `❌ No drops found for **${rsn}**. Check the spelling or try a different name.`, flags: 64 });
      }

      const topLines = stats.topDrops.map((d, i) => {
        const date = new Date(d.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const item = d.item_name && d.item_name !== 'Monthly aggregate' ? d.item_name : 'Unknown item';
        return `${MEDALS[i] ?? `${i + 1}.`} **${item}** — ${formatGp(d.gp_value)} *(${date})*`;
      });

      const embed = new EmbedBuilder()
        .setTitle(`🔍 ${stats.displayName}`)
        .setColor(0xf1c40f)
        .setDescription(
          `**Total Loot:** ${formatGp(stats.totalGp)}\n**Drops Recorded:** ${stats.dropCount.toLocaleString()}\n\n▬▬▬▬▬▬▬▬▬\n🏆 Top Drops\n${topLines.join('\n')}`
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

      const period = interaction.options.getString('period') ?? 'all';
      let afterSnowflake = null;
      if (period !== 'all') {
        const days = parseInt(period);
        afterSnowflake = dateToSnowflake(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
      }
      const periodLabel = period === 'all' ? 'all time' : `last ${period}`;

      await interaction.editReply(`⏳ Scraping channel history (${periodLabel})... this may take a while.`);

      const [nameMap, tsConfig] = await Promise.all([
        getNameChangeMap(guildId),
        loadTrackscape(guildId),
      ]);
      const resolve = name => resolveNameFromMap(nameMap, name);

      let messages;
      try {
        messages = await fetchAllMessages(channel, afterSnowflake);
      } catch (err) {
        console.error(`[lootboard scrape] Failed to fetch messages: ${err.message}`);
        return interaction.editReply('❌ Failed to fetch channel history.');
      }

      const totals = {};
      const dropRows = [];
      let counted = 0;

      // Scan drops channel (Dink webhooks / bot loot embeds)
      for (const msg of messages) {
        if (!msg.webhookId && !msg.author?.bot) continue;
        let embedIdx = 0;
        for (const embed of (msg.embeds ?? [])) {
          if (isLootEmbed(embed)) {
            const rawName = parseLootPlayer(embed, msg.content);
            const gp = parseLootEmbed(embed);
            if (rawName && gp > 0) {
              const name = resolve(rawName);
              totals[name] = (totals[name] ?? 0) + gp;
              dropRows.push({ ts: msg.createdAt, name, item: parseLootItem(embed), imageUrl: parseLootImage(embed), screenshotUrl: parseLootScreenshot(embed, msg), gp, messageId: msg.id, embedIdx });
              counted++;
            }
          }
          embedIdx++;
        }
      }

      // Scan broadcast channel for TrackScape drop announcements
      let broadcastScanned = 0;
      let broadcastCounted = 0;
      if (tsConfig.broadcastChannelId) {
        const bChannel = await interaction.client.channels.fetch(tsConfig.broadcastChannelId).catch(() => null);
        if (bChannel) {
          let bMessages = [];
          try { bMessages = await fetchAllMessages(bChannel, afterSnowflake); } catch {}
          broadcastScanned = bMessages.length;
          for (const msg of bMessages) {
            if (!msg.author?.bot) continue;
            for (let i = 0; i < (msg.embeds ?? []).length; i++) {
              const parsed = parseBroadcastDropEmbed(msg.embeds[i]);
              if (parsed && parsed.value > 0) {
                const name = resolve(parsed.player);
                totals[name] = (totals[name] ?? 0) + parsed.value;
                dropRows.push({ ts: msg.createdAt, name, item: parsed.item, imageUrl: null, screenshotUrl: null, gp: parsed.value, messageId: msg.id, embedIdx: i });
                counted++;
                broadcastCounted++;
              }
            }
          }
        }
      }

      // Insert into DB — dedup index silently skips already-recorded messages
      for (const row of dropRows) {
        await recordDrop(guildId, row.name, row.gp, row.item, row.imageUrl, row.screenshotUrl, row.messageId, row.embedIdx);
      }

      const total = Object.values(totals).reduce((a, b) => a + b, 0);
      const playerCount = Object.keys(totals).length;

      dropRows.sort((a, b) => a.ts - b.ts);
      const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

      const lines = [
        `Loot Scrape Log — ${new Date().toISOString()} — period: ${periodLabel}`,
        `Drops channel scanned    : ${messages.length.toLocaleString()} messages`,
        `Broadcast channel scanned: ${broadcastScanned.toLocaleString()} messages (${broadcastCounted} drops)`,
        `Drops found (total)      : ${counted.toLocaleString()}`,
        `Players                  : ${playerCount}`,
        `Total value              : ${formatGp(total)}`,
        `Name changes applied     : ${nameMap.size}`,
        '',
        '=== ITEMIZED DROPS ===',
        'Timestamp'.padEnd(22) + 'Player'.padEnd(22) + 'Item'.padEnd(40) + 'Value',
        '-'.repeat(100),
        ...dropRows.map(r => {
          const ts = r.ts.toISOString().replace('T', ' ').slice(0, 16);
          return ts.padEnd(22) + r.name.padEnd(22) + (r.item ?? '').padEnd(40) + formatGp(r.gp);
        }),
        '',
        '=== PLAYER TOTALS ===',
        'Player'.padEnd(30) + 'Total',
        '-'.repeat(50),
        ...sorted.map(([name, gp]) => name.padEnd(30) + formatGp(gp)),
      ];
      const attachment = new AttachmentBuilder(Buffer.from(lines.join('\n'), 'utf8'), { name: 'scrape-log.txt' });

      console.log(`[lootboard scrape] ${counted} drops (${broadcastCounted} broadcast), ${formatGp(total)} across ${playerCount} players in guild ${guildId}`);

      return interaction.editReply({
        content: `✅ Scrape complete (${periodLabel}) — **${counted} drops** (${broadcastCounted} from broadcasts), **${formatGp(total)}**, **${playerCount} players**. Duplicates skipped automatically.`,
        files: [attachment],
      });
    }
  }
};
