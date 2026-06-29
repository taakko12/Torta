const fs = require('fs');
const path = require('path');

function announcePath(guildId) {
  const dir = path.join(__dirname, '../data', guildId);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'announce.json');
}

function loadAnnounce(guildId) {
  try { return JSON.parse(fs.readFileSync(announcePath(guildId), 'utf8')); } catch { return null; }
}

function saveAnnounce(guildId, data) {
  fs.writeFileSync(announcePath(guildId), JSON.stringify(data, null, 2));
}

function clearAnnounce(guildId) {
  try { fs.unlinkSync(announcePath(guildId)); } catch {}
}

module.exports = { loadAnnounce, saveAnnounce, clearAnnounce };
