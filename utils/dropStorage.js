const supabase = require('./supabase');

// ── Channel config ───────────────────────────────────────────────────────────

async function getDropsChannelId(guildId) {
  const { data } = await supabase
    .from('guild_config')
    .select('drops_channel_id')
    .eq('guild_id', guildId)
    .maybeSingle();
  return data?.drops_channel_id ?? null;
}

async function setDropsChannel(guildId, channelId) {
  const { error } = await supabase
    .from('guild_config')
    .upsert({ guild_id: guildId, drops_channel_id: channelId }, { onConflict: 'guild_id' });
  if (error) throw error;
}

// ── Write ────────────────────────────────────────────────────────────────────

async function recordDrop(guildId, playerName, gpValue, itemName = null, imageUrl = null, screenshotUrl = null, messageId = null, embedIndex = 0) {
  // Cross-source dedup (Dink vs TrackScape plugin): if the same player already
  // has a drop of the same GP value in the last 5 minutes, it's a duplicate.
  // Backfill any richer metadata (screenshot, item name) onto the existing row.
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from('drops')
    .select('id, image_url, screenshot_url, item_name')
    .eq('guild_id', guildId)
    .ilike('player_name', playerName)
    .eq('gp_value', gpValue)
    .gte('recorded_at', since)
    .limit(1)
    .maybeSingle();

  if (recent) {
    const patch = {};
    if (imageUrl && !recent.image_url) patch.image_url = imageUrl;
    if (screenshotUrl && !recent.screenshot_url) patch.screenshot_url = screenshotUrl;
    if (itemName && !recent.item_name) patch.item_name = itemName;
    if (Object.keys(patch).length > 0) {
      await supabase.from('drops').update(patch).eq('id', recent.id);
    }
    return;
  }

  const { error } = await supabase.from('drops').insert({
    guild_id: guildId,
    player_name: playerName.toLowerCase(),
    gp_value: gpValue,
    item_name: itemName,
    image_url: imageUrl,
    screenshot_url: screenshotUrl,
    discord_message_id: messageId,
    embed_index: embedIndex ?? 0,
  });
  if (error) {
    if (error.code !== '23505') throw error;
    if (messageId != null) {
      const patch = {};
      if (imageUrl) patch.image_url = imageUrl;
      if (screenshotUrl) patch.screenshot_url = screenshotUrl;
      if (itemName) patch.item_name = itemName;
      if (Object.keys(patch).length > 0) {
        await supabase.from('drops')
          .update(patch)
          .eq('guild_id', guildId)
          .eq('discord_message_id', messageId)
          .eq('embed_index', embedIndex ?? 0);
      }
    }
  }
}

// ── Read ─────────────────────────────────────────────────────────────────────

async function getMonthlyLeaderboard(guildId) {
  const { data, error } = await supabase.rpc('monthly_drop_leaderboard', { p_guild_id: guildId });
  if (error) throw error;
  return (data ?? []).map(r => ({ name: r.player_name, total: Number(r.total) }));
}

async function getAlltimeLeaderboard(guildId) {
  const { data, error } = await supabase.rpc('alltime_drop_leaderboard', { p_guild_id: guildId });
  if (error) throw error;
  return (data ?? []).map(r => ({ name: r.player_name, total: Number(r.total) }));
}

async function getMostRecentDrop(guildId) {
  const { data } = await supabase
    .from('drops')
    .select('player_name, gp_value, item_name, image_url, screenshot_url, recorded_at')
    .eq('guild_id', guildId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function getPlayerStats(guildId, playerName) {
  const [{ data: topDrops }, { data: allDrops }] = await Promise.all([
    supabase
      .from('drops')
      .select('item_name, gp_value, recorded_at')
      .eq('guild_id', guildId)
      .ilike('player_name', playerName)
      .order('gp_value', { ascending: false })
      .limit(3),
    supabase
      .from('drops')
      .select('gp_value, player_name')
      .eq('guild_id', guildId)
      .ilike('player_name', playerName),
  ]);
  const drops = allDrops ?? [];
  return {
    topDrops: topDrops ?? [],
    totalGp: drops.reduce((sum, r) => sum + Number(r.gp_value), 0),
    dropCount: drops.length,
    // Use exact casing from DB for display
    displayName: drops[0]?.player_name ?? playerName,
  };
}

// ── Name changes ─────────────────────────────────────────────────────────────

async function saveNameChange(guildId, oldName, newName) {
  const { error } = await supabase.from('name_changes').upsert({
    guild_id: guildId,
    old_name: oldName.toLowerCase(),
    new_name: newName.toLowerCase(),
  }, { onConflict: 'guild_id,old_name' });
  if (error) throw error;
}

async function getNameChangeMap(guildId) {
  const { data } = await supabase
    .from('name_changes')
    .select('old_name, new_name')
    .eq('guild_id', guildId);
  return new Map((data ?? []).map(r => [r.old_name, r.new_name]));
}

function resolveNameFromMap(map, name) {
  const seen = new Set();
  let current = name.toLowerCase();
  while (map.has(current) && !seen.has(current)) {
    seen.add(current);
    current = map.get(current);
  }
  return current;
}

// ── Admin ────────────────────────────────────────────────────────────────────

async function renamePlayer(guildId, oldName, newName) {
  const { count } = await supabase
    .from('drops')
    .select('*', { count: 'exact', head: true })
    .eq('guild_id', guildId)
    .ilike('player_name', oldName);
  if (!count) return 0;

  const { error } = await supabase
    .from('drops')
    .update({ player_name: newName.toLowerCase() })
    .eq('guild_id', guildId)
    .ilike('player_name', oldName);
  if (error) throw error;
  return count;
}

async function resetMonthlyDrops(guildId) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { error } = await supabase
    .from('drops')
    .delete()
    .eq('guild_id', guildId)
    .gte('recorded_at', monthStart);
  if (error) throw error;
}

// ── Parsing helpers (pure functions) ─────────────────────────────────────────

function parseGpString(str) {
  if (!str) return null;
  const clean = str.replace(/,/g, '').trim();
  const match = clean.match(/^([\d.]+)\s*([KMBkmb])?/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const suffix = (match[2] ?? '').toUpperCase();
  if (suffix === 'B') return Math.round(num * 1_000_000_000);
  if (suffix === 'M') return Math.round(num * 1_000_000);
  if (suffix === 'K') return Math.round(num * 1_000);
  return Math.round(num);
}

function parseLootEmbed(embed) {
  for (const field of (embed.fields ?? [])) {
    if (/total\s*value/i.test(field.name)) {
      const gp = parseGpString(field.value.replace(/\s*gp/i, '').trim());
      if (gp != null) return gp;
    }
  }
  const desc = embed.description ?? '';
  const allMatches = [...desc.matchAll(/\(([\d.,]+[KMBkmb]?)\)/g)];
  if (allMatches.length > 0) {
    const values = allMatches.map(m => parseGpString(m[1]) ?? 0);
    return Math.max(...values);
  }
  const gpMatch = desc.match(/([\d.,]+[KMBkmb]?)\s*gp/i);
  if (gpMatch) return parseGpString(gpMatch[1]);
  return null;
}

function parseLootItem(embed) {
  const desc = embed.description ?? '';

  // Best source: "N x Item Name (value)" line in description (Loot Watch / Dink format)
  const itemMatch = desc.match(/\d+\s*x\s+(.+?)\s*\(/);
  if (itemMatch) return itemMatch[1].trim();

  // Fallback: title, but skip generic titles like "Loot Drop"
  const title = embed.title ?? '';
  if (title) {
    const stripped = title.replace(/^(valuable\s+drop|loot\s+drop|loot|drop)\s*:?\s*/i, '').trim();
    if (stripped && !/^(drop|loot)$/i.test(stripped)) return stripped;
  }

  // Last resort: first description line
  const firstLine = desc.split('\n')[0];
  return firstLine.replace(/\([\d.,]+[KMBkmb]?\)/g, '').replace(/has looted/i, '').trim() || 'Unknown item';
}

function parseLootImage(embed) {
  return embed.thumbnail?.url ?? null; // OSRS wiki item sprite
}

function parseLootScreenshot(embed, message = null) {
  if (embed.image?.url) return embed.image.url;
  return message?.attachments?.first()?.url ?? null;
}

function parseLootPlayer(embed, content) {
  if (embed) {
    const authorName = embed.author?.name ?? '';
    if (authorName) return authorName.trim();
    const desc = embed.description ?? '';
    const descMatch = desc.match(/^(.+?)\s+has looted/i);
    if (descMatch) return descMatch[1].trim();
  }
  if (content) {
    const match = content.match(/^(.+?)\s+has looted/i);
    if (match) return match[1].trim();
  }
  return null;
}

module.exports = {
  getDropsChannelId,
  setDropsChannel,
  recordDrop,
  getMonthlyLeaderboard,
  getAlltimeLeaderboard,
  getMostRecentDrop,
  getPlayerStats,
  saveNameChange,
  getNameChangeMap,
  resolveNameFromMap,
  renamePlayer,
  resetMonthlyDrops,
  parseGpString,
  parseLootEmbed,
  parseLootImage,
  parseLootScreenshot,
  parseLootItem,
  parseLootPlayer,
};
