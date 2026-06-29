function isLootEmbed(embed) {
  const text = `${embed.title ?? ''} ${embed.description ?? ''}`;
  return /loot|looted|received a drop|drop:/i.test(text);
}

function dateToSnowflake(date) {
  return ((BigInt(date.getTime()) - 1420070400000n) << 22n).toString();
}

module.exports = { isLootEmbed, dateToSnowflake };
