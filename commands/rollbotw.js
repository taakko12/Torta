const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
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

// Wilderness bosses and their singles-area variants share the same content —
// rolling one should block the other for the same window.
const BOSS_PAIRS = {
  callisto: 'artio',   artio: 'callisto',
  venenatis: 'spindel', spindel: 'venenatis',
  vetion: 'calvarion', calvarion: 'vetion',
};

// Convert a CT wall-clock date+time to a UTC Date.
// Works correctly for both CDT (UTC-5) and CST (UTC-6) by asking Intl what
// offset is actually in effect for that moment.
function ctToUtc(year, month, day, hour, minute = 0) {
  // Build a pseudo-UTC date using the CT values so we can probe the offset
  const pseudo = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  // Intl tells us what CT wall-clock time corresponds to pseudo (server is UTC)
  const ctRendered = new Date(pseudo.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  // diff = how far pseudo drifted from actual CT wall-clock
  const diff = pseudo - ctRendered;
  return new Date(pseudo.getTime() + diff);
}

// Returns the UTC ISO strings for the next BOTW window:
// Monday 1:00 PM CT → following Monday 12:00 PM CT.
// If today is Monday, today is used as the start.
function nextBotwWindow() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
  }).formatToParts(now).reduce((a, { type, value }) => ({ ...a, [type]: value }), {});

  const DAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const daysUntilMonday = (1 - DAYS[parts.weekday] + 7) % 7;

  // Build CT calendar date for the Monday
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

const REROLL_THRESHOLD = 5;

function buildButtons(votes = 0) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('botw_accept').setLabel('✅ Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('botw_reroll')
      .setLabel(votes > 0 ? `🔄 Reroll (${votes}/${REROLL_THRESHOLD})` : '🔄 Reroll')
      .setStyle(ButtonStyle.Secondary),
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rollbotw')
    .setDescription('Randomly select a Boss of the Week — Mon 1pm CT to next Mon 12pm CT')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const data = loadData(guildId);

    const history = data.botwHistory ?? [];
    const recentSet = new Set();
    for (const b of history.slice(-HISTORY_SIZE)) {
      recentSet.add(b);
      if (BOSS_PAIRS[b]) recentSet.add(BOSS_PAIRS[b]);
    }
    const sessionRejected = new Set();
    const rerollVoters = new Set();

    const { startsAt, endsAt } = nextBotwWindow();
    const windowStr = `${formatCt(startsAt)} → ${formatCt(endsAt)}`;

    const buildPool = () => BOTW_BOSSES.filter(b => !recentSet.has(b) && !sessionRejected.has(b));

    let pool = buildPool();
    if (pool.length === 0) {
      data.botwHistory = [];
      pool = [...BOTW_BOSSES];
    }

    let rolled = pool[Math.floor(Math.random() * pool.length)];
    const recentNames = history.slice(-HISTORY_SIZE).map(b => DISPLAY[b] ?? b);

    const buildEmbed = (boss, votes = 0) => new EmbedBuilder()
      .setTitle('💀 Boss of the Week')
      .setColor(0xe74c3c)
      .setDescription(`## ${DISPLAY[boss] ?? boss}`)
      .addFields(
        { name: 'Competition window', value: windowStr },
        { name: 'Recent picks (excluded)', value: recentNames.length > 0 ? recentNames.join(', ') : 'None yet' },
      )
      .setFooter({ text: `Mods: Accept to lock in | Anyone: ${REROLL_THRESHOLD} votes to reroll • Times out in 5 min` })
      .setTimestamp();

    function doReroll() {
      sessionRejected.add(rolled);
      if (BOSS_PAIRS[rolled]) sessionRejected.add(BOSS_PAIRS[rolled]);
      let next = buildPool();
      if (next.length === 0) {
        sessionRejected.clear();
        next = buildPool();
      }
      rolled = next[Math.floor(Math.random() * next.length)];
      rerollVoters.clear();
    }

    const response = await interaction.reply({
      embeds: [buildEmbed(rolled)],
      components: [buildButtons()],
      fetchReply: true,
    });

    // No user filter — anyone in the server can interact
    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 5 * 60 * 1000,
    });

    collector.on('collect', async i => {
      if (i.customId === 'botw_accept') {
        if (!i.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          await i.reply({ content: '❌ Only moderators can accept the roll.', ephemeral: true });
          return;
        }

        data.botwHistory = [...history, rolled].slice(-HISTORY_SIZE * 2);
        saveData(guildId, data);

        const finalEmbed = new EmbedBuilder()
          .setTitle('💀 Boss of the Week — Locked In')
          .setColor(0xe74c3c)
          .setDescription(`## ${DISPLAY[rolled] ?? rolled}`)
          .addFields(
            { name: 'Competition window', value: windowStr },
            { name: 'Recent picks (excluded)', value: recentNames.length > 0 ? recentNames.join(', ') : 'None yet' },
          )
          .setTimestamp();

        const pair = BOSS_PAIRS[rolled];
        const bossLabel = pair ? `${DISPLAY[rolled] ?? rolled} + ${DISPLAY[pair] ?? pair}` : (DISPLAY[rolled] ?? rolled);
        const title = `Boss of the Week — ${DISPLAY[rolled] ?? rolled}`;
        const pairTitle = pair ? `Boss of the Week — ${DISPLAY[pair] ?? pair}` : null;

        const [comp, pairComp] = await Promise.all([
          createWomCompetition(rolled, startsAt, endsAt, title),
          pair ? createWomCompetition(pair, startsAt, endsAt, pairTitle) : Promise.resolve(null),
        ]);

        if (comp?.id || pairComp?.id) {
          const links = [
            comp?.id ? `[${DISPLAY[rolled] ?? rolled}](https://wiseoldman.net/competitions/${comp.id})` : null,
            pairComp?.id ? `[${DISPLAY[pair] ?? pair}](https://wiseoldman.net/competitions/${pairComp.id})` : null,
          ].filter(Boolean).join(' + ');
          finalEmbed.addFields({ name: '🏆 WOM Competitions', value: links });
        } else if (process.env.WOM_GROUP_VERIFICATION_CODE) {
          finalEmbed.addFields({ name: '⚠️ WOM', value: 'Competition creation failed — check WOM API.' });
        } else {
          finalEmbed.addFields({ name: 'ℹ️ WOM', value: 'Add `WOM_GROUP_VERIFICATION_CODE` to Railway env to auto-create competitions.' });
        }

        if (pair) finalEmbed.setDescription(`## ${bossLabel}`);

        await i.update({ embeds: [finalEmbed], components: [] });
        collector.stop('accepted');

      } else if (i.customId === 'botw_reroll') {
        // Mod invoker gets an instant reroll; everyone else casts a vote
        if (i.user.id === interaction.user.id) {
          doReroll();
          await i.update({ embeds: [buildEmbed(rolled)], components: [buildButtons()] });
          return;
        }

        if (rerollVoters.has(i.user.id)) {
          await i.reply({ content: '⚠️ You already voted to reroll.', ephemeral: true });
          return;
        }

        rerollVoters.add(i.user.id);

        if (rerollVoters.size >= REROLL_THRESHOLD) {
          doReroll();
          await i.update({ embeds: [buildEmbed(rolled)], components: [buildButtons()] });
        } else {
          await i.update({ embeds: [buildEmbed(rolled)], components: [buildButtons(rerollVoters.size)] });
        }
      }
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'accepted') {
        interaction.editReply({ components: [] }).catch(() => {});
      }
    });
  },
};
