const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const {
  getDropsChannelId, setDropsChannel,
  getMonthlyLeaderboard, getAlltimeLeaderboard,
  recordDrop, resetMonthlyDrops, getPlayerStats,
  getNameChangeMap, resolveNameFromMap, normalizeName,
  parseLootItems, parseLootImage, parseLootScreenshot, parseLootPlayer,
} = require('../utils/dropStorage');
const supabase = require('../utils/supabase');
const { loadTrackscape } = require('../utils/trackscapeStorage');
const { currentMonth } = require('../utils/plankStorage');
const { MEDALS } = require('../utils/constants');
const { isLootEmbed, dateToSnowflake } = require('../utils/messageHelper');

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
    )
    .addSubcommand(sub => sub
      .setName('backfillimages')
      .setDescription('Copy Dink screenshot URLs onto TrackScape records that are missing images')
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
        let dropIdx = 0;
        for (const embed of (msg.embeds ?? [])) {
          if (!isLootEmbed(embed)) continue;
          const rawName = parseLootPlayer(embed, msg.content);
          if (!rawName) continue;
          const name = resolve(rawName);
          const imageUrl = parseLootImage(embed);
          const screenshotUrl = parseLootScreenshot(embed, msg);
          for (const { item, gpValue: gp } of parseLootItems(embed)) {
            totals[name] = (totals[name] ?? 0) + gp;
            dropRows.push({ ts: msg.createdAt, name, item, imageUrl, screenshotUrl, gp, messageId: msg.id, embedIdx: dropIdx });
            counted++;
            dropIdx++;
          }
        }
      }

      // Scan broadcast channel for TrackScape drop announcements
      let broadcastScanned = 0;
      let broadcastCounted = 0;
      let broadcastNoValue = 0;
      let broadcastStatus = 'not configured';
      if (tsConfig.broadcastChannelId) {
        const bChannel = await interaction.client.channels.fetch(tsConfig.broadcastChannelId).catch(() => null);
        if (!bChannel) {
          broadcastStatus = `channel ${tsConfig.broadcastChannelId} not found or no access`;
        } else {
          let bMessages = [];
          try {
            bMessages = await fetchAllMessages(bChannel, afterSnowflake);
            broadcastStatus = 'ok';
          } catch (err) {
            broadcastStatus = `fetch failed: ${err.message}`;
          }
          broadcastScanned = bMessages.length;
          for (const msg of bMessages) {
            if (!msg.author?.bot) continue;
            for (let i = 0; i < (msg.embeds ?? []).length; i++) {
              const parsed = parseBroadcastDropEmbed(msg.embeds[i]);
              if (!parsed) continue;
              if (parsed.value > 0) {
                const name = resolve(parsed.player);
                totals[name] = (totals[name] ?? 0) + parsed.value;
                dropRows.push({ ts: msg.createdAt, name, item: parsed.item, imageUrl: null, screenshotUrl: null, gp: parsed.value, messageId: msg.id, embedIdx: i });
                counted++;
                broadcastCounted++;
              } else {
                broadcastNoValue++;
              }
            }
          }
        }
      }

      // Insert into DB — dedup index silently skips already-recorded messages
      for (const row of dropRows) {
        await recordDrop(guildId, row.name, row.gp, row.item, row.imageUrl, row.screenshotUrl, row.messageId, row.embedIdx, row.ts);
      }

      const total = Object.values(totals).reduce((a, b) => a + b, 0);
      const playerCount = Object.keys(totals).length;

      dropRows.sort((a, b) => a.ts - b.ts);
      const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

      const lines = [
        `Loot Scrape Log — ${new Date().toISOString()} — period: ${periodLabel}`,
        `Drops channel scanned    : ${messages.length.toLocaleString()} messages`,
        `Broadcast channel status : ${broadcastStatus}`,
        `Broadcast channel scanned: ${broadcastScanned.toLocaleString()} messages`,
        `  → recorded             : ${broadcastCounted} drops`,
        `  → skipped (no value)   : ${broadcastNoValue} embeds (posted before coin value was added to embed)`,
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

    if (sub === 'backfillimages') {
      const channelId = await getDropsChannelId(guildId);
      if (!channelId) {
        return interaction.reply({ content: '❌ No loot channel set. Run `/lootboard setchannel` first.', flags: 64 });
      }

      await interaction.deferReply({ flags: 64 });

      const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
      if (!channel) return interaction.editReply('❌ Loot channel not found.');

      const period = interaction.options.getString('period') ?? 'all';
      let afterSnowflake = null;
      if (period !== 'all') {
        const days = parseInt(period);
        afterSnowflake = dateToSnowflake(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
      }

      await interaction.editReply(`⏳ Scanning #loot-watch for Dink screenshots (${period === 'all' ? 'all time' : `last ${period}`})...`);

      const [nameMap, messages] = await Promise.all([
        getNameChangeMap(guildId),
        fetchAllMessages(channel, afterSnowflake),
      ]);
      const resolve = name => resolveNameFromMap(nameMap, name);

      let patched = 0;
      let deleted = 0;
      let noMatch = 0;

      for (const msg of messages) {
        if (!msg.webhookId && !msg.author?.bot) continue;
        let dropIdx = 0;
        for (const embed of msg.embeds ?? []) {
          if (!isLootEmbed(embed)) continue;

          const screenshotUrl = parseLootScreenshot(embed, msg);
          const imageUrl = parseLootImage(embed);
          const rawName = parseLootPlayer(embed, msg.content);
          if (!rawName) continue;
          const name = normalizeName(resolve(rawName));

          for (const { item: itemName, gpValue: gp } of parseLootItems(embed)) {
            if (!screenshotUrl && !imageUrl) { noMatch++; dropIdx++; continue; }

            const baseQ = () => supabase
              .from('drops')
              .select('id')
              .eq('guild_id', guildId)
              .eq('player_name', name)
              .is('screenshot_url', null)
              .neq('discord_message_id', msg.id)
              .order('id', { ascending: true })
              .limit(1);

            let target = null;
            if (itemName) {
              const { data } = await baseQ().ilike('item_name', itemName).maybeSingle();
              target = data;
            }
            if (!target) {
              const { data } = await baseQ().eq('gp_value', gp).maybeSingle();
              target = data;
            }

            if (target) {
              const patch = {};
              if (screenshotUrl) patch.screenshot_url = screenshotUrl;
              if (imageUrl) patch.image_url = imageUrl;
              await supabase.from('drops').update(patch).eq('id', target.id);
              patched++;

              await supabase.from('drops')
                .delete()
                .eq('guild_id', guildId)
                .eq('discord_message_id', msg.id)
                .eq('embed_index', dropIdx);
              deleted++;
            } else {
              noMatch++;
            }
            dropIdx++;
          }
        }
      }

      return interaction.editReply(
        `✅ Backfill complete — **${patched} records** updated with Dink screenshots, **${deleted} duplicates** removed, **${noMatch}** Dink messages had no matching imageless record.`
      );
    }
  }
};
