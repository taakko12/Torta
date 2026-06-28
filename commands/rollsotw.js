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

async function createWomCompetition(metric, startsAt, endsAt, title) {
  const groupId = process.env.WOM_GROUP_ID;
  const verificationCode = process.env.WOM_GROUP_VERIFICATION_CODE;
  if (!groupId || !verificationCode) return null;

  try {
    const res = await fetch('https://api.wiseoldman.net/v2/competitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'torta-clan-bot' },
      body: JSON.stringify({ title, metric, startsAt, endsAt, groupId: parseInt(groupId), groupVerificationCode: verificationCode }),
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
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt => opt
      .setName('starts')
      .setDescription('Competition start date (YYYY-MM-DD) — required to auto-create on WOM')
    )
    .addStringOption(opt => opt
      .setName('ends')
      .setDescription('Competition end date (YYYY-MM-DD) — required to auto-create on WOM')
    ),

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
    data.sotwHistory = [...history, rolled].slice(-HISTORY_SIZE * 2); // keep a bit more for reference
    saveData(guildId, data);

    const recentNames = history.slice(-HISTORY_SIZE).map(s => DISPLAY[s] ?? s);

    const startsRaw = interaction.options.getString('starts');
    const endsRaw = interaction.options.getString('ends');

    const embed = new EmbedBuilder()
      .setTitle('📈 Skill of the Week')
      .setColor(0x57f287)
      .setDescription(`## ${DISPLAY[rolled]}`)
      .addFields({
        name: 'Recent picks (excluded)',
        value: recentNames.length > 0 ? recentNames.join(', ') : 'None yet',
      })
      .setTimestamp();

    // Attempt WOM competition creation if dates provided
    if (startsRaw && endsRaw) {
      const startsAt = new Date(`${startsRaw}T00:00:00Z`).toISOString();
      const endsAt = new Date(`${endsRaw}T23:59:59Z`).toISOString();
      const title = `Skill of the Week — ${DISPLAY[rolled]}`;

      const comp = await createWomCompetition(rolled, startsAt, endsAt, title);
      if (comp?.id) {
        embed.addFields({
          name: '🏆 WOM Competition',
          value: `[${title}](https://wiseoldman.net/competitions/${comp.id})`,
        });
      } else if (process.env.WOM_GROUP_VERIFICATION_CODE) {
        embed.addFields({ name: '⚠️ WOM', value: 'Competition creation failed — check dates or WOM API.' });
      } else {
        embed.addFields({ name: 'ℹ️ WOM', value: 'Add `WOM_GROUP_VERIFICATION_CODE` to Railway env to auto-create competitions.' });
      }
    }

    return interaction.reply({ embeds: [embed] });
  },
};
