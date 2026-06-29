const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { loadData, saveData } = require('./storage');
const supabase = require('./supabase');

// ── Constants ─────────────────────────────────────────────────────────────────

const HISTORY_SIZE = 5;
const OPTION_LABELS = ['1️⃣', '2️⃣', '3️⃣'];

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

const BOTW_DISPLAY = {
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

const SOTW_SKILLS = [
  'agility', 'construction', 'cooking', 'crafting', 'farming',
  'firemaking', 'fishing', 'fletching', 'herblore', 'hunter',
  'mining', 'runecrafting', 'slayer', 'smithing', 'thieving', 'woodcutting',
];

const SOTW_DISPLAY = {
  agility: 'Agility', construction: 'Construction', cooking: 'Cooking',
  crafting: 'Crafting', farming: 'Farming', firemaking: 'Firemaking',
  fishing: 'Fishing', fletching: 'Fletching', herblore: 'Herblore',
  hunter: 'Hunter', mining: 'Mining', runecrafting: 'Runecrafting',
  slayer: 'Slayer', smithing: 'Smithing', thieving: 'Thieving', woodcutting: 'Woodcutting',
};

// Maps each metric to its group partners (array). Supports both pairs and trios.
// Partners are excluded from appearing alongside each other in the same poll,
// and all get their own WOM competition when any member of the group wins.
const BOSS_PARTNERS = {
  callisto: ['artio'],    artio: ['callisto'],
  venenatis: ['spindel'], spindel: ['venenatis'],
  vetion: ['calvarion'],  calvarion: ['vetion'],
  // Raid normal ↔ challenge/hard/expert modes
  chambers_of_xeric: ['chambers_of_xeric_challenge_mode'], chambers_of_xeric_challenge_mode: ['chambers_of_xeric'],
  theatre_of_blood: ['theatre_of_blood_hard_mode'],         theatre_of_blood_hard_mode: ['theatre_of_blood'],
  tombs_of_amascut: ['tombs_of_amascut_expert_mode'],       tombs_of_amascut_expert_mode: ['tombs_of_amascut'],
  the_gauntlet: ['the_corrupted_gauntlet'],                 the_corrupted_gauntlet: ['the_gauntlet'],
  // Group vs solo instance
  nightmare: ['phosani_nightmare'],                         phosani_nightmare: ['nightmare'],
  // Same thematic progression / always done together
  tztok_jad: ['tzkal_zuk'],                                 tzkal_zuk: ['tztok_jad'],
  crazy_archaeologist: ['deranged_archaeologist'],           deranged_archaeologist: ['crazy_archaeologist'],
  // Dagannoth Kings trio — all three run simultaneously
  dagannoth_prime:   ['dagannoth_rex', 'dagannoth_supreme'],
  dagannoth_rex:     ['dagannoth_prime', 'dagannoth_supreme'],
  dagannoth_supreme: ['dagannoth_prime', 'dagannoth_rex'],
};

// Collective display name overrides for groups larger than a pair
const BOSS_GROUP_LABELS = {
  dagannoth_prime:   'Dagannoth Kings',
  dagannoth_rex:     'Dagannoth Kings',
  dagannoth_supreme: 'Dagannoth Kings',
};

function getBossPartners(metric) {
  return BOSS_PARTNERS[metric] ?? [];
}

// ── Time helpers ──────────────────────────────────────────────────────────────

function ctToUtc(year, month, day, hour, minute = 0) {
  const pseudo = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const ctRendered = new Date(pseudo.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  return new Date(pseudo.getTime() + (pseudo - ctRendered));
}

function nextCompWindow() {
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

// ── Vote helpers ──────────────────────────────────────────────────────────────

// user_votes is { userId: candidateIndex } — flat map, allows vote changing
function getVoteCounts(userVotes, numCandidates) {
  const counts = Array(numCandidates).fill(0);
  for (const idx of Object.values(userVotes)) {
    if (idx >= 0 && idx < numCandidates) counts[idx]++;
  }
  return counts;
}

function getWinnerIndex(userVotes, numCandidates) {
  const counts = getVoteCounts(userVotes, numCandidates);
  let winIdx = 0;
  for (let i = 1; i < numCandidates; i++) {
    if (counts[i] > counts[winIdx]) winIdx = i;
  }
  return winIdx;
}

// ── Pool / rolling ────────────────────────────────────────────────────────────

function getDisplay(pollType, metric) {
  return (pollType === 'botw' ? BOTW_DISPLAY : SOTW_DISPLAY)[metric] ?? metric;
}

function rollCandidates(pollType, preRollHistory, sessionRejected, numCandidates = 3) {
  const all = pollType === 'botw' ? BOTW_BOSSES : SOTW_SKILLS;
  const recentSet = new Set();
  for (const b of (preRollHistory ?? []).slice(-HISTORY_SIZE)) {
    recentSet.add(b);
    if (pollType === 'botw') for (const p of getBossPartners(b)) recentSet.add(p);
  }
  const rejectedSet = new Set(sessionRejected ?? []);

  // Progressively relax exclusions if pool is too small
  let pool = all.filter(b => !recentSet.has(b) && !rejectedSet.has(b));
  if (pool.length < numCandidates) pool = all.filter(b => !recentSet.has(b));
  if (pool.length < numCandidates) pool = [...all];

  const result = [];
  const used = new Set();
  const remaining = [...pool];
  while (result.length < numCandidates && remaining.length > 0) {
    const idx = Math.floor(Math.random() * remaining.length);
    const pick = remaining.splice(idx, 1)[0];
    if (used.has(pick)) continue;
    result.push(pick);
    used.add(pick);
    if (pollType === 'botw') for (const p of getBossPartners(pick)) used.add(p);
  }
  return result;
}

// ── Discord embed/component builders ─────────────────────────────────────────

function buildPollEmbed(poll) {
  const { poll_type, candidates, user_votes, window_str, cutoff_unix, recent_names } = poll;
  const counts = getVoteCounts(user_votes, candidates.length);
  const lines = candidates.map((c, i) => {
    const n = counts[i];
    return `${OPTION_LABELS[i]} **${getDisplay(poll_type, c)}** — ${n} vote${n !== 1 ? 's' : ''}`;
  }).join('\n');

  return new EmbedBuilder()
    .setTitle(poll_type === 'botw' ? '💀 Boss of the Week' : '📈 Skill of the Week')
    .setColor(poll_type === 'botw' ? 0xe74c3c : 0x57f287)
    .setDescription(lines)
    .addFields(
      { name: 'Competition window', value: window_str },
      { name: 'Voting closes', value: `<t:${cutoff_unix}:f> (<t:${cutoff_unix}:R>)` },
      { name: 'Recent picks (excluded)', value: (recent_names ?? []).length > 0 ? recent_names.join(', ') : 'None yet' },
    )
    .setFooter({ text: 'Vote for your pick | Mods: Accept Winner or Reroll for new options' })
    .setTimestamp();
}

function buildPollComponents(poll) {
  const { poll_type, candidates, user_votes } = poll;
  const counts = getVoteCounts(user_votes, candidates.length);
  const voteRow = new ActionRowBuilder().addComponents(
    candidates.map((c, i) => new ButtonBuilder()
      .setCustomId(`${poll_type}_vote_${i}`)
      .setLabel(`${OPTION_LABELS[i]} ${getDisplay(poll_type, c)} (${counts[i]})`)
      .setStyle(ButtonStyle.Primary)
    )
  );
  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${poll_type}_accept`).setLabel('✅ Accept Winner').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${poll_type}_reroll`).setLabel('🔄 Reroll Options').setStyle(ButtonStyle.Secondary),
  );
  return [voteRow, controlRow];
}

// ── WOM ───────────────────────────────────────────────────────────────────────

async function createWomCompetition(metric, startsAt, endsAt, title, tag) {
  const groupId = process.env.WOM_GROUP_ID;
  const verificationCode = process.env.WOM_GROUP_VERIFICATION_CODE;
  if (!groupId || !verificationCode) {
    console.error(`[${tag}] Missing env vars — WOM_GROUP_ID: ${groupId ? 'set' : 'MISSING'}, WOM_GROUP_VERIFICATION_CODE: ${verificationCode ? 'set' : 'MISSING'}`);
    return null;
  }
  console.log(`[${tag}] Creating WOM competition: metric=${metric} starts=${new Date(startsAt).toISOString()}`);
  try {
    const res = await fetch('https://api.wiseoldman.net/v2/competitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'torta-clan-bot' },
      body: JSON.stringify({
        title, metric,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        groupId: parseInt(groupId),
        groupVerificationCode: verificationCode,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[${tag}] WOM API ${res.status}: ${err}`);
      return null;
    }
    const json = await res.json();
    return json?.competition ?? json;
  } catch (e) {
    console.error(`[${tag}] WOM API fetch error: ${e.message}`);
    return null;
  }
}

// ── Lock-in ───────────────────────────────────────────────────────────────────

async function lockInPoll(poll, client, autoClose = false) {
  const { id: pollId, guild_id, channel_id, message_id, poll_type,
    candidates, user_votes, starts_at, ends_at, window_str, recent_names, pre_roll_history } = poll;

  // Atomically claim the poll — if already locked by another process, skip
  const { count } = await supabase.from('active_polls').delete({ count: 'exact' }).eq('id', pollId);
  if (!count) return;

  const winIdx = getWinnerIndex(user_votes, candidates.length);
  const winner = candidates[winIdx];
  const tag = `roll${poll_type}`;
  const noun = poll_type === 'botw' ? 'Boss' : 'Skill';
  const emoji = poll_type === 'botw' ? '💀' : '📈';

  // Build the full group: winner + all partners
  const partners = poll_type === 'botw' ? getBossPartners(winner) : [];
  const allMetrics = [winner, ...partners];
  const groupLabel = BOSS_GROUP_LABELS[winner]
    ?? allMetrics.map(m => getDisplay(poll_type, m)).join(' + ');

  const comps = await Promise.all(
    allMetrics.map(m => createWomCompetition(
      m, starts_at, ends_at,
      `${noun} of the Week — ${getDisplay(poll_type, m)}`,
      tag,
    ))
  );

  const finalEmbed = new EmbedBuilder()
    .setTitle(`${emoji} ${noun} of the Week — Locked In${autoClose ? ' (Auto)' : ''}`)
    .setColor(poll_type === 'botw' ? 0xe74c3c : 0x57f287)
    .setDescription(`## ${groupLabel}`)
    .addFields(
      { name: 'Competition window', value: window_str },
      { name: 'Recent picks (excluded)', value: (recent_names ?? []).length > 0 ? recent_names.join(', ') : 'None yet' },
    )
    .setTimestamp();

  const compLinks = allMetrics
    .map((m, i) => comps[i]?.id
      ? `[${getDisplay(poll_type, m)}](https://wiseoldman.net/competitions/${comps[i].id})`
      : null)
    .filter(Boolean).join(' + ');

  if (compLinks) {
    finalEmbed.addFields({ name: `🏆 WOM ${comps.filter(Boolean).length > 1 ? 'Competitions' : 'Competition'}`, value: compLinks });
  } else if (process.env.WOM_GROUP_VERIFICATION_CODE) {
    finalEmbed.addFields({ name: '⚠️ WOM', value: 'Competition creation failed — check WOM API.' });
  } else {
    finalEmbed.addFields({ name: 'ℹ️ WOM', value: 'Add `WOM_GROUP_VERIFICATION_CODE` to Railway env to auto-create competitions.' });
  }

  // Update Discord message
  try {
    const channel = await client.channels.fetch(channel_id);
    const msg = await channel.messages.fetch(message_id);
    await msg.edit({ embeds: [finalEmbed], components: [] });
  } catch (e) {
    console.error(`[${tag}] Failed to update Discord message: ${e.message}`);
  }

  // Persist winner to guild history
  const data = loadData(guild_id);
  const histKey = poll_type === 'botw' ? 'botwHistory' : 'sotwHistory';
  data[histKey] = [...(pre_roll_history ?? []), winner].slice(-HISTORY_SIZE * 2);
  saveData(guild_id, data);

  console.log(`[${tag}] Locked in: ${winner}${autoClose ? ' (auto)' : ''}`);
}

module.exports = {
  BOTW_BOSSES, BOTW_DISPLAY, SOTW_SKILLS, SOTW_DISPLAY, BOSS_PARTNERS, BOSS_GROUP_LABELS,
  getBossPartners,
  HISTORY_SIZE, OPTION_LABELS,
  nextCompWindow, formatCt,
  getDisplay, getVoteCounts, getWinnerIndex, rollCandidates,
  buildPollEmbed, buildPollComponents,
  createWomCompetition, lockInPoll,
};
