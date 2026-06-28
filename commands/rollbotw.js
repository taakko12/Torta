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
  chambers_of_xeric: 'Chambers of Xeric', chambers_of_xeric_challenge_mode: 'CoX (CM)',
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
  the_corrupted_gauntlet: 'Corrupted Gauntlet', the_hueycoatl: 'The Hueycoatl',
  the_leviathan: 'The Leviathan', the_whisperer: 'The Whisperer',
  theatre_of_blood: 'Theatre of Blood', theatre_of_blood_hard_mode: 'ToB (HM)',
  thermonuclear_smoke_devil: 'Thermonuclear Smoke Devil',
  tombs_of_amascut: 'Tombs of Amascut', tombs_of_amascut_expert_mode: 'ToA (Expert)',
  tzkal_zuk: 'TzKal-Zuk', tztok_jad: 'TzTok-Jad',
  vardorvis: 'Vardorvis', venenatis: 'Venenatis', vetion: "Vet'ion",
  vorkath: 'Vorkath', wintertodt: 'Wintertodt', zalcano: 'Zalcano', zulrah: 'Zulrah',
};

const HISTORY_SIZE = 5;

const BOSS_PAIRS = {
  callisto: 'artio',   artio: 'callisto',
  venenatis: 'spindel', spindel: 'venenatis',
  vetion: 'calvarion', calvarion: 'vetion',
};

const OPTION_LABELS = ['1️⃣', '2️⃣', '3️⃣'];

function ctToUtc(year, month, day, hour, minute = 0) {
  const pseudo = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const ctRendered = new Date(pseudo.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const diff = pseudo - ctRendered;
  return new Date(pseudo.getTime() + diff);
}

function nextBotwWindow() {
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

  return { startsAt: ctToUtc(y1, m1, d1, 13, 0), endsAt: ctToUtc(y2, m2, d2, 12, 0) };
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
  if (!groupId || !verificationCode) {
    console.error(`[rollbotw] Missing env vars — WOM_GROUP_ID: ${groupId ? 'set' : 'MISSING'}, WOM_GROUP_VERIFICATION_CODE: ${verificationCode ? 'set' : 'MISSING'}`);
    return null;
  }
  console.log(`[rollbotw] Creating WOM competition: metric=${metric} groupId=${groupId} starts=${startsAt.toISOString()}`);
  try {
    const body = { title, metric, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), groupId: parseInt(groupId), groupVerificationCode: verificationCode };
    const res = await fetch('https://api.wiseoldman.net/v2/competitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'torta-clan-bot' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[rollbotw] WOM API ${res.status}: ${err}`);
      return null;
    }
    const json = await res.json();
    return json?.competition ?? json;
  } catch (e) {
    console.error(`[rollbotw] WOM API fetch error: ${e.message}`);
    return null;
  }
}

function buildComponents(candidates, voteCounts) {
  const voteRow = new ActionRowBuilder().addComponents(
    candidates.map((c, i) => new ButtonBuilder()
      .setCustomId(`botw_vote_${i}`)
      .setLabel(`${OPTION_LABELS[i]} ${DISPLAY[c] ?? c} (${voteCounts[i].size})`)
      .setStyle(ButtonStyle.Primary)
    )
  );
  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('botw_accept').setLabel('✅ Accept Winner').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('botw_reroll').setLabel('🔄 Reroll Options').setStyle(ButtonStyle.Secondary),
  );
  return [voteRow, controlRow];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rollbotw')
    .setDescription('Roll 3 Boss of the Week options — community votes, auto-locks 10 min before start')
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

    const { startsAt, endsAt } = nextBotwWindow();
    const windowStr = `${formatCt(startsAt)} → ${formatCt(endsAt)}`;
    const votingCutoff = new Date(startsAt.getTime() - 10 * 60 * 1000);
    const cutoffUnix = Math.floor(votingCutoff.getTime() / 1000);
    const timeUntilCutoff = Math.max(60_000, votingCutoff.getTime() - Date.now());

    const recentNames = history.slice(-HISTORY_SIZE).map(b => DISPLAY[b] ?? b);

    const buildPool = () => BOTW_BOSSES.filter(b => !recentSet.has(b) && !sessionRejected.has(b));

    function rollCandidates() {
      let pool = buildPool();
      if (pool.length < 3) { sessionRejected.clear(); pool = buildPool(); }
      const result = [];
      const usedAndPairs = new Set();
      const remaining = [...pool];
      while (result.length < 3 && remaining.length > 0) {
        const idx = Math.floor(Math.random() * remaining.length);
        const pick = remaining.splice(idx, 1)[0];
        if (usedAndPairs.has(pick)) continue;
        result.push(pick);
        usedAndPairs.add(pick);
        if (BOSS_PAIRS[pick]) usedAndPairs.add(BOSS_PAIRS[pick]);
      }
      return result;
    }

    function getWinner(candidates, voteCounts) {
      let winIdx = 0;
      for (let i = 1; i < candidates.length; i++) {
        if (voteCounts[i].size > voteCounts[winIdx].size) winIdx = i;
      }
      return candidates[winIdx];
    }

    let candidates = rollCandidates();
    let voteCounts = [new Set(), new Set(), new Set()];
    const userVote = new Map();

    const buildEmbed = () => {
      const optionLines = candidates.map((c, i) => {
        const n = voteCounts[i].size;
        return `${OPTION_LABELS[i]} **${DISPLAY[c] ?? c}** — ${n} vote${n !== 1 ? 's' : ''}`;
      }).join('\n');
      return new EmbedBuilder()
        .setTitle('💀 Boss of the Week')
        .setColor(0xe74c3c)
        .setDescription(optionLines)
        .addFields(
          { name: 'Competition window', value: windowStr },
          { name: 'Voting closes', value: `<t:${cutoffUnix}:f> (<t:${cutoffUnix}:R>)` },
          { name: 'Recent picks (excluded)', value: recentNames.length > 0 ? recentNames.join(', ') : 'None yet' },
        )
        .setFooter({ text: 'Vote for your pick | Mods: Accept Winner or Reroll for new options' })
        .setTimestamp();
    };

    async function lockIn(winner, autoClose = false) {
      data.botwHistory = [...history, winner].slice(-HISTORY_SIZE * 2);
      saveData(guildId, data);

      const pair = BOSS_PAIRS[winner];
      const title = `Boss of the Week — ${DISPLAY[winner] ?? winner}`;
      const pairTitle = pair ? `Boss of the Week — ${DISPLAY[pair] ?? pair}` : null;
      const bossLabel = pair ? `${DISPLAY[winner] ?? winner} + ${DISPLAY[pair] ?? pair}` : (DISPLAY[winner] ?? winner);

      const [comp, pairComp] = await Promise.all([
        createWomCompetition(winner, startsAt, endsAt, title),
        pair ? createWomCompetition(pair, startsAt, endsAt, pairTitle) : Promise.resolve(null),
      ]);

      const finalEmbed = new EmbedBuilder()
        .setTitle(`💀 Boss of the Week — Locked In${autoClose ? ' (Auto)' : ''}`)
        .setColor(0xe74c3c)
        .setDescription(`## ${bossLabel}`)
        .addFields(
          { name: 'Competition window', value: windowStr },
          { name: 'Recent picks (excluded)', value: recentNames.length > 0 ? recentNames.join(', ') : 'None yet' },
        )
        .setTimestamp();

      if (comp?.id || pairComp?.id) {
        const links = [
          comp?.id ? `[${DISPLAY[winner] ?? winner}](https://wiseoldman.net/competitions/${comp.id})` : null,
          pairComp?.id ? `[${DISPLAY[pair] ?? pair}](https://wiseoldman.net/competitions/${pairComp.id})` : null,
        ].filter(Boolean).join(' + ');
        finalEmbed.addFields({ name: '🏆 WOM Competitions', value: links });
      } else if (process.env.WOM_GROUP_VERIFICATION_CODE) {
        finalEmbed.addFields({ name: '⚠️ WOM', value: 'Competition creation failed — check WOM API.' });
      } else {
        finalEmbed.addFields({ name: 'ℹ️ WOM', value: 'Add `WOM_GROUP_VERIFICATION_CODE` to Railway env to auto-create competitions.' });
      }

      return finalEmbed;
    }

    const response = await interaction.reply({
      embeds: [buildEmbed()],
      components: buildComponents(candidates, voteCounts),
      fetchReply: true,
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: timeUntilCutoff,
    });

    collector.on('collect', async i => {
      if (i.customId.startsWith('botw_vote_')) {
        const idx = parseInt(i.customId.slice(-1));
        if (isNaN(idx) || idx >= candidates.length) return;

        const prev = userVote.get(i.user.id);
        if (prev !== undefined) voteCounts[prev].delete(i.user.id);
        userVote.set(i.user.id, idx);
        voteCounts[idx].add(i.user.id);

        await i.update({ embeds: [buildEmbed()], components: buildComponents(candidates, voteCounts) });

      } else if (i.customId === 'botw_accept') {
        if (!i.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          await i.reply({ content: '❌ Only moderators can accept.', ephemeral: true });
          return;
        }
        const winner = getWinner(candidates, voteCounts);
        const finalEmbed = await lockIn(winner);
        await i.update({ embeds: [finalEmbed], components: [] });
        collector.stop('accepted');

      } else if (i.customId === 'botw_reroll') {
        if (!i.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          await i.reply({ content: '❌ Only moderators can reroll.', ephemeral: true });
          return;
        }
        for (const c of candidates) {
          sessionRejected.add(c);
          if (BOSS_PAIRS[c]) sessionRejected.add(BOSS_PAIRS[c]);
        }
        candidates = rollCandidates();
        voteCounts = [new Set(), new Set(), new Set()];
        userVote.clear();
        await i.update({ embeds: [buildEmbed()], components: buildComponents(candidates, voteCounts) });
      }
    });

    collector.on('end', async (_, reason) => {
      if (reason === 'time') {
        const winner = getWinner(candidates, voteCounts);
        const finalEmbed = await lockIn(winner, true);
        await interaction.editReply({ embeds: [finalEmbed], components: [] }).catch(() => {});
      } else if (reason !== 'accepted') {
        interaction.editReply({ components: [] }).catch(() => {});
      }
    });
  },
};
