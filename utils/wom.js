const { womGet } = require('./womClient');

// Straight from WOM's documented enums (docs.wiseoldman.net/api/global-type-definitions)
const SKILL_METRICS = new Set([
  'overall', 'attack', 'defence', 'strength', 'hitpoints', 'ranged', 'prayer',
  'magic', 'cooking', 'woodcutting', 'fletching', 'fishing', 'firemaking',
  'crafting', 'smithing', 'mining', 'herblore', 'agility', 'thieving',
  'slayer', 'farming', 'runecrafting', 'hunter', 'construction', 'sailing'
]);

const BOSS_METRICS = new Set([
  'abyssal_sire', 'alchemical_hydra', 'amoxliatl', 'araxxor', 'artio',
  'barrows_chests', 'brutus', 'bryophyta', 'callisto', 'calvarion', 'cerberus',
  'chambers_of_xeric', 'chambers_of_xeric_challenge_mode', 'chaos_elemental',
  'chaos_fanatic', 'commander_zilyana', 'corporeal_beast',
  'crazy_archaeologist', 'dagannoth_prime', 'dagannoth_rex',
  'dagannoth_supreme', 'deranged_archaeologist', 'doom_of_mokhaiotl',
  'duke_sucellus', 'general_graardor', 'giant_mole', 'grotesque_guardians',
  'hespori', 'kalphite_queen', 'king_black_dragon', 'kraken', 'kreearra',
  'kril_tsutsaroth', 'lunar_chests', 'mimic', 'nex', 'nightmare',
  'phosanis_nightmare', 'obor', 'phantom_muspah', 'sarachnis', 'scorpia',
  'scurrius', 'shellbane_gryphon', 'skotizo', 'sol_heredit', 'spindel',
  'tempoross', 'the_gauntlet', 'the_corrupted_gauntlet', 'the_hueycoatl',
  'the_leviathan', 'the_royal_titans', 'the_whisperer', 'theatre_of_blood',
  'theatre_of_blood_hard_mode', 'thermonuclear_smoke_devil',
  'tombs_of_amascut', 'tombs_of_amascut_expert', 'tzkal_zuk', 'tztok_jad',
  'vardorvis', 'venenatis', 'vetion', 'vorkath', 'wintertodt', 'yama',
  'zalcano', 'zulrah'
]);

function isOngoing(comp) {
  const now = Date.now();
  return new Date(comp.startsAt).getTime() <= now && now <= new Date(comp.endsAt).getTime();
}

function requireGroupId() {
  const groupId = process.env.WOM_GROUP_ID;
  if (!groupId) {
    throw new Error('WOM_GROUP_ID is not set in your .env file.');
  }
  return groupId;
}

async function getGroupCompetitions() {
  const groupId = requireGroupId();
  return womGet(`/groups/${groupId}/competitions`, { limit: 50 });
}

// Of all ongoing competitions whose metric is a Skill, returns the most
// recently started one (in case more than one happens to overlap).
async function getCurrentSkillCompetition() {
  const competitions = await getGroupCompetitions();
  const candidates = competitions
    .filter(isOngoing)
    .filter(c => SKILL_METRICS.has(c.metric))
    .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
  return candidates[0] ?? null;
}

// Same idea, but for Boss metrics.
async function getCurrentBossCompetition() {
  const competitions = await getGroupCompetitions();
  const candidates = competitions
    .filter(isOngoing)
    .filter(c => BOSS_METRICS.has(c.metric))
    .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
  return candidates[0] ?? null;
}

// Fetches full standings for a competition (XP/KC gained per participant).
async function getCompetitionStandings(competitionId) {
  return womGet(`/competitions/${competitionId}`);
}

// Clan-wide leaderboard for EHP or EHB gained over a period (default: week).
async function getGroupGained(metric, period = 'week', limit = 3) {
  const groupId = requireGroupId();
  return womGet(`/groups/${groupId}/gained`, { metric, period, limit });
}

module.exports = {
  SKILL_METRICS,
  BOSS_METRICS,
  isOngoing,
  getGroupCompetitions,
  getCurrentSkillCompetition,
  getCurrentBossCompetition,
  getCompetitionStandings,
  getGroupGained
};
