const fs = require('fs');
const path = require('path');
const { currentMonth } = require('./plankStorage');

const DEFAULT = { channelId: null, month: null, drops: {}, allTime: {} };

function dataPath(guildId) {
  return path.join(__dirname, '..', 'data', guildId, 'drops.json');
}

function loadDrops(guildId) {
  const p = dataPath(guildId);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(DEFAULT, null, 2));
    return { ...DEFAULT };
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function saveDrops(guildId, data) {
  const p = dataPath(guildId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function checkAndReset(data) {
  const month = currentMonth();
  if (data.month !== month) {
    data.month = month;
    data.drops = {};
    return true;
  }
  return false;
}

function getDropLeaderboard(data) {
  checkAndReset(data);
  return Object.entries(data.drops)
    .sort(([, a], [, b]) => b - a)
    .map(([name, total]) => ({ name, total }));
}

// Parse a GP string that may use K/M/B shorthand (e.g. "1.10M", "876K", "1,234,567")
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

// Parse GP value from a Dink loot embed. Returns null if not parseable.
function parseLootEmbed(embed) {
  // Prefer the "Total Value" field (Dink always includes this)
  for (const field of (embed.fields ?? [])) {
    if (/total\s*value/i.test(field.name)) {
      const gp = parseGpString(field.value.replace(/\s*gp/i, '').trim());
      if (gp != null) return gp;
    }
  }

  // Fallback: scan description for inline values like "(1.10M)" or "1,234,567 gp"
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

// Parse player name from a Dink loot embed/content
function parseLootPlayer(embed, content) {
  if (embed) {
    // Author name is the most reliable (Dink sets it to the player RSN)
    const authorName = embed.author?.name ?? '';
    if (authorName) return authorName.trim();

    // Description: "PlayerName has looted: ..."
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

function recordDrop(guildId, data, playerName, gpValue) {
  checkAndReset(data);
  const key = playerName.toLowerCase();
  data.drops[key] = (data.drops[key] ?? 0) + gpValue;
  if (!data.allTime) data.allTime = {};
  data.allTime[key] = (data.allTime[key] ?? 0) + gpValue;
  saveDrops(guildId, data);
}

function getAlltimeLeaderboard(data) {
  const allTime = data.allTime ?? {};
  return Object.entries(allTime)
    .sort(([, a], [, b]) => b - a)
    .map(([name, total]) => ({ name, total }));
}

module.exports = { loadDrops, saveDrops, recordDrop, getDropLeaderboard, getAlltimeLeaderboard, parseLootEmbed, parseLootPlayer, checkAndReset };
