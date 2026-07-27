function isLootEmbed(embed) {
  const text = `${embed.title ?? ''} ${embed.description ?? ''}`;
  return /loot|looted|received a drop|drop:/i.test(text);
}

function dateToSnowflake(date) {
  return ((BigInt(date.getTime()) - 1420070400000n) << 22n).toString();
}

function parseBroadcastDropEmbed(embed) {
  const title = embed.title ?? '';
  // Strip bold markdown so patterns work regardless of whether TrackScape
  // formats player/item names with ** or not (format varies by drop type).
  const desc = (embed.description ?? '').replace(/\*\*/g, '');
  const parseVal = s => s ? parseInt(s.replace(/[,\s]/g, ''), 10) || null : null;

  if (title.includes('Raid Drop')) {
    const m = desc.match(/^(.+?) received (.+?)(?:\s*\(([,\d]+) coins\))?$/);
    if (!m) return null;
    return { player: m[1], item: m[2].trim(), value: parseVal(m[3]) };
  }
  if (title === '💰 Drop') {
    const m = desc.match(/^(.+?) received a drop: (?:\d+x )?(.+?)(?:\s*\(([,\d]+) coins\))?$/);
    if (!m) return null;
    return { player: m[1], item: m[2].trim(), value: parseVal(m[3]) };
  }
  if (title.includes('Clue Item')) {
    const m = desc.match(/^(.+?) received a clue item: (.+?) \(([,\d]+) coins\)/);
    if (!m) return null;
    return { player: m[1], item: m[2], value: parseVal(m[3]) };
  }
  return null;
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

const ACHIEVEMENT_TITLES = ['Collection Log', 'XP Milestone', 'Level Up', 'Personal Best'];

function parseBroadcastAchievementEmbed(embed) {
  const title = embed.title ?? '';
  const desc = (embed.description ?? '').replace(/\*\*/g, '');
  if (!ACHIEVEMENT_TITLES.some(t => title.includes(t))) return null;
  const m = desc.match(/^(.+?) (?:received|reached|set) /);
  if (!m) return null;
  return { player: m[1], title, description: desc };
}

module.exports = { isLootEmbed, dateToSnowflake, parseBroadcastDropEmbed, parseBroadcastAchievementEmbed, fetchAllMessages };
