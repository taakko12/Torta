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

module.exports = { isLootEmbed, dateToSnowflake, parseBroadcastDropEmbed };
