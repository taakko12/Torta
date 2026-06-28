const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { loadData, saveData } = require('../utils/storage');

const SOTW_SKILLS = [
  'agility', 'construction', 'cooking', 'crafting', 'farming',
  'firemaking', 'fishing', 'fletching', 'herblore', 'hunter',
  'mining', 'runecrafting', 'slayer', 'smithing', 'thieving', 'woodcutting',
];

const DISPLAY = {
  agility: 'Agility', construction: 'Construction', cooking: 'Cooking',
  crafting: 'Crafting', farming: 'Farming', firemaking: 'Firemaking',
  fishing: 'Fishing', fletching: 'Fletching', herblore: 'Herblore',
  hunter: 'Hunter', mining: 'Mining', runecrafting: 'Runecrafting',
  slayer: 'Slayer', smithing: 'Smithing', thieving: 'Thieving', woodcutting: 'Woodcutting',
};

const HISTORY_SIZE = 5;

function ctToUtc(year, month, day, hour, minute = 0) {
  const pseudo = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const ctRendered = new Date(pseudo.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const diff = pseudo - ctRendered;
  return new Date(pseudo.getTime() + diff);
}

function nextSotwWindow() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
  }).formatToParts(now).reduce((a, { type, value }) => ({ ...a, [type]: value }), {});

  const DAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const daysUntilMonday = (1 - DAYS[parts.weekday] + 7) % 7;

  const mondayCt = new Date(Date.UTC(parseInt(parts.year), parseInt(parts.month) - 1, parseInt(parts.day)));
  mondayCt.setUTCDate(mondayCt.getUTCDate() + daysUntilMonday);

  const y1 = mondayCt.getUTCFullYear(), m1 = mondayCt.getUTCMonth() + 1, d1 = mondayCt.getUTCDate();
  const endCt = new Date(mondayCt);
  endCt.setUTCDate(endCt.getUTCDate() + 7);
  const y2 = endCt.getUTCFullYear(), m2 = endCt.getUTCMonth() + 1, d2 = endCt.getUTCDate();

  const startsAt = ctToUtc(y1, m1, d1, 13, 0);
  const endsAt   = ctToUtc(y2, m2, d2, 12, 0);
  return { startsAt, endsAt };
}

function formatCt(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(date);
}

async function createWomCompetition(metric, startsAt, endsAt, title) {
  const groupId = process.env.WOM_GROUP_ID;
  const verificationCode = process.env.WOM_GROUP_VERIFICATION_CODE;
  if (!groupId || !verificationCode) return null;

  try {
    const res = await fetch('https://api.wiseoldman.net/v2/competitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'torta-clan-bot' },
      body: JSON.stringify({ title, metric, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), groupId: parseInt(groupId), groupVerificationCode: verificationCode }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rollsotw')
    .setDescription('Randomly select a Skill of the Week — excludes combat skills and the last 5 picks')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const data = loadData(guildId);

    const history = data.sotwHistory ?? [];
    const recentSet = new Set(history.slice(-HISTORY_SIZE));

    let available = SOTW_SKILLS.filter(s => !recentSet.has(s));
    if (available.length === 0) {
      data.sotwHistory = [];
      available = [...SOTW_SKILLS];
    }

    const rolled = available[Math.floor(Math.random() * available.length)];
    data.sotwHistory = [...history, rolled].slice(-HISTORY_SIZE * 2);
    saveData(guildId, data);

    const recentNames = history.slice(-HISTORY_SIZE).map(s => DISPLAY[s] ?? s);
    const { startsAt, endsAt } = nextSotwWindow();
    const title = `Skill of the Week — ${DISPLAY[rolled]}`;

    const embed = new EmbedBuilder()
      .setTitle('📈 Skill of the Week')
      .setColor(0x57f287)
      .setDescription(`## ${DISPLAY[rolled]}`)
      .addFields(
        { name: 'Starts', value: formatCt(startsAt), inline: true },
        { name: 'Ends',   value: formatCt(endsAt),   inline: true },
        { name: 'Recent picks (excluded)', value: recentNames.length > 0 ? recentNames.join(', ') : 'None yet' },
      )
      .setTimestamp();

    const comp = await createWomCompetition(rolled, startsAt, endsAt, title);
    if (comp?.id) {
      embed.addFields({
        name: '🏆 WOM Competition',
        value: `[${title}](https://wiseoldman.net/competitions/${comp.id})`,
      });
    } else if (process.env.WOM_GROUP_VERIFICATION_CODE) {
      embed.addFields({ name: '⚠️ WOM', value: 'Competition creation failed — check WOM API.' });
    }

    return interaction.reply({ embeds: [embed] });
  },
};
