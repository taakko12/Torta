const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { loadData, saveData } = require('../utils/storage');

const BOTW_BOSSES = [
  'abyssal_sire', 'alchemical_hydra', 'amoxliatl', 'araxxor', 'artio',
  'barrows_chests', 'bryophyta', 'callisto', 'calvarion', 'cerberus',
  'chambers_of_xeric', 'chambers_of_xeric_challenge_mode',
  'chaos_elemental', 'chaos_fanatic', 'commander_zilyana', 'corporeal_beast',
  'crazy_archaeologist', 'dagannoth_prime', 'dagannoth_rex', 'dagannoth_supreme',
  'deranged_archaeologist', 'duke_sucellus', 'general_graardor', 'giant_mole',
  'grotesque_guardians', 'hespori', 'king_black_dragon', 'kraken',
  'kreearra', 'kril_tsutsaroth', 'nex', 'nightmare',
  'obor', 'phantom_muspah', 'phosani_nightmare', 'sarachnis',
  'scorpia', 'scurrius', 'skotizo', 'sol_heredit', 'spindel',
  'tempoross', 'the_gauntlet', 'the_corrupted_gauntlet',
  'the_hueycoatl', 'the_leviathan', 'the_whisperer',
  'theatre_of_blood', 'theatre_of_blood_hard_mode',
  'thermonuclear_smoke_devil', 'tombs_of_amascut', 'tombs_of_amascut_expert_mode',
  'tzkal_zuk', 'tztok_jad', 'vardorvis', 'venenatis', 'vetion',
  'vorkath', 'wintertodt', 'zalcano', 'zulrah',
];

const DISPLAY = {
  abyssal_sire: 'Abyssal Sire', alchemical_hydra: 'Alchemical Hydra',
  amoxliatl: 'Amoxliatl', araxxor: 'Araxxor', artio: 'Artio',
  barrows_chests: 'Barrows', bryophyta: 'Bryophyta',
  callisto: 'Callisto', calvarion: "Calvar'ion", cerberus: 'Cerberus',
  chambers_of_xeric: 'Chambers of Xeric', chambers_of_xeric_challenge_mode: 'Chambers of Xeric (CM)',
  chaos_elemental: 'Chaos Elemental', chaos_fanatic: 'Chaos Fanatic',
  commander_zilyana: 'Commander Zilyana', corporeal_beast: 'Corporeal Beast',
  crazy_archaeologist: 'Crazy Archaeologist',
  dagannoth_prime: 'Dagannoth Prime', dagannoth_rex: 'Dagannoth Rex',
  dagannoth_supreme: 'Dagannoth Supreme', deranged_archaeologist: 'Deranged Archaeologist',
  duke_sucellus: 'Duke Sucellus', general_graardor: 'General Graardor',
  giant_mole: 'Giant Mole', grotesque_guardians: 'Grotesque Guardians',
  hespori: 'Hespori', king_black_dragon: 'King Black Dragon', kraken: 'Kraken',
  kreearra: "Kree'Arra", kril_tsutsaroth: "K'ril Tsutsaroth",
  nex: 'Nex', nightmare: 'The Nightmare', obor: 'Obor',
  phantom_muspah: 'Phantom Muspah', phosani_nightmare: "Phosani's Nightmare",
  sarachnis: 'Sarachnis', scorpia: 'Scorpia', scurrius: 'Scurrius',
  skotizo: 'Skotizo', sol_heredit: 'Sol Heredit', spindel: 'Spindel',
  tempoross: 'Tempoross', the_gauntlet: 'The Gauntlet',
  the_corrupted_gauntlet: 'The Corrupted Gauntlet', the_hueycoatl: 'The Hueycoatl',
  the_leviathan: 'The Leviathan', the_whisperer: 'The Whisperer',
  theatre_of_blood: 'Theatre of Blood', theatre_of_blood_hard_mode: 'Theatre of Blood (HM)',
  thermonuclear_smoke_devil: 'Thermonuclear Smoke Devil',
  tombs_of_amascut: 'Tombs of Amascut', tombs_of_amascut_expert_mode: 'Tombs of Amascut (Expert)',
  tzkal_zuk: 'TzKal-Zuk', tztok_jad: 'TzTok-Jad',
  vardorvis: 'Vardorvis', venenatis: 'Venenatis', vetion: "Vet'ion",
  vorkath: 'Vorkath', wintertodt: 'Wintertodt', zalcano: 'Zalcano', zulrah: 'Zulrah',
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
    .setName('rollbotw')
    .setDescription('Randomly select a Boss of the Week — excludes the last 5 picks')
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

    const history = data.botwHistory ?? [];
    const recentSet = new Set(history.slice(-HISTORY_SIZE));

    let available = BOTW_BOSSES.filter(b => !recentSet.has(b));
    if (available.length === 0) {
      data.botwHistory = [];
      available = [...BOTW_BOSSES];
    }

    const rolled = available[Math.floor(Math.random() * available.length)];
    data.botwHistory = [...history, rolled].slice(-HISTORY_SIZE * 2);
    saveData(guildId, data);

    const recentNames = history.slice(-HISTORY_SIZE).map(b => DISPLAY[b] ?? b);

    const startsRaw = interaction.options.getString('starts');
    const endsRaw = interaction.options.getString('ends');

    const embed = new EmbedBuilder()
      .setTitle('💀 Boss of the Week')
      .setColor(0xe74c3c)
      .setDescription(`## ${DISPLAY[rolled] ?? rolled}`)
      .addFields({
        name: 'Recent picks (excluded)',
        value: recentNames.length > 0 ? recentNames.join(', ') : 'None yet',
      })
      .setTimestamp();

    if (startsRaw && endsRaw) {
      const startsAt = new Date(`${startsRaw}T00:00:00Z`).toISOString();
      const endsAt = new Date(`${endsRaw}T23:59:59Z`).toISOString();
      const title = `Boss of the Week — ${DISPLAY[rolled] ?? rolled}`;

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
