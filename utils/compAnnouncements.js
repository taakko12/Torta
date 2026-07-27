const supabase = require('./supabase');
const { getGroupCompetitions, BOSS_METRICS, SKILL_METRICS } = require('./wom');
const { buildCompetitionStartedEmbed } = require('./womEmbeds');
const { metricLabel } = require('./compWinners');

const RECENT_WINDOW_MS = 48 * 3_600_000; // ignore competitions that started more than 48h ago (first-run backlog guard)

// Groups paired boss competitions (e.g. Nightmare + Phosanis Nightmare, rolled and
// starting together) into one announcement, mirroring groupEndedCompetitions in compWinners.js.
function groupStartedCompetitions(started) {
  const byStartsAt = new Map();
  for (const c of started) {
    const key = BOSS_METRICS.has(c.metric) ? `botw:${c.startsAt}` : `sotw:${c.id}`;
    if (!byStartsAt.has(key)) byStartsAt.set(key, []);
    byStartsAt.get(key).push(c);
  }
  return [...byStartsAt.values()];
}

async function checkStartedCompetitions(client) {
  const guildId = process.env.CLAN_GUILD_ID;
  if (!guildId || !process.env.WOM_GROUP_ID) return;

  const { data: cfg } = await supabase.from('guild_config').select('poll_channel_id').eq('guild_id', guildId).maybeSingle();
  if (!cfg?.poll_channel_id) return;

  let competitions;
  try {
    competitions = await getGroupCompetitions();
  } catch (err) {
    console.error(`[comp-announce] Failed to fetch competitions: ${err.message}`);
    return;
  }

  const now = Date.now();
  const started = competitions.filter(c => {
    const startsAt = new Date(c.startsAt).getTime();
    return startsAt <= now && now - startsAt <= RECENT_WINDOW_MS && (BOSS_METRICS.has(c.metric) || SKILL_METRICS.has(c.metric));
  });
  if (!started.length) return;

  for (const group of groupStartedCompetitions(started)) {
    const primary = group[0];
    const competitionIds = group.map(c => c.id);
    const compType = BOSS_METRICS.has(primary.metric) ? 'botw' : 'sotw';

    const { data: existing } = await supabase.from('comp_start_announcements').select('competition_id').eq('guild_id', guildId).in('competition_id', competitionIds);
    if (existing?.length) continue; // already announced (any competition in this group)

    const label = group.length > 1
      ? group.map(c => metricLabel(compType, c.metric)).join(' + ')
      : metricLabel(compType, primary.metric);

    try {
      const channel = await client.channels.fetch(cfg.poll_channel_id);
      const embed = buildCompetitionStartedEmbed(primary, { compType, groupLabel: label });
      await channel.send({ embeds: [embed] });
      await supabase.from('comp_start_announcements').insert(competitionIds.map(id => ({ guild_id: guildId, competition_id: id })));
      console.log(`[comp-announce] Posted start announcement for ${label}`);
    } catch (err) {
      console.error(`[comp-announce] Failed to post start announcement: ${err.message}`);
    }
  }
}

module.exports = { checkStartedCompetitions };
