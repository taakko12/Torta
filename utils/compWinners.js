const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const supabase = require('./supabase');
const { getGroupCompetitions, getCompetitionStandings, BOSS_METRICS, SKILL_METRICS } = require('./wom');
const { BOTW_DISPLAY, SOTW_DISPLAY } = require('./pollHelpers');
const { humanize, formatNumber, buildCompetitionEndedEmbed } = require('./womEmbeds');

const BOTW_COLOR = 0xed4245;
const SOTW_COLOR = 0x57f287;
const RECENT_WINDOW_MS = 48 * 3_600_000; // ignore competitions that ended more than 48h ago (first-run backlog guard)

function metricLabel(compType, metric) {
  return (compType === 'botw' ? BOTW_DISPLAY : SOTW_DISPLAY)[metric] ?? humanize(metric);
}

async function findDiscordId(guildId, rsn) {
  const { data } = await supabase.from('rsn_links').select('discord_id').eq('guild_id', guildId).ilike('rsn', rsn).limit(1).maybeSingle();
  return data?.discord_id ?? null;
}

function buildApprovalEmbed({ compType, label, gained, unit, winnerName, discordId }) {
  const color = compType === 'botw' ? BOTW_COLOR : SOTW_COLOR;
  const embed = new EmbedBuilder()
    .setTitle(`${compType === 'botw' ? '💀' : '📈'} ${compType === 'botw' ? 'BOTW' : 'SOTW'} Ended — Approve Winner`)
    .setColor(color)
    .setTimestamp()
    .addFields(
      { name: 'Competition', value: label, inline: true },
      { name: 'Gained', value: `${formatNumber(gained)} ${unit}`, inline: true },
    );

  if (discordId) {
    embed.addFields({ name: 'Winner', value: `<@${discordId}> (${winnerName})`, inline: false });
  } else {
    embed.addFields({ name: '⚠️ No Discord link found', value: `No linked Discord account for RSN **${winnerName}**. Link them in the admin panel (Members → RSN Links) or Discord \`/link\`, then hit Recheck.`, inline: false });
  }
  return embed;
}

function buildApprovalComponents(id, hasDiscordId) {
  if (hasDiscordId) {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`comp_winner_approve:${id}`).setLabel('✅ Approve').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`comp_winner_reject:${id}`).setLabel('❌ Reject').setStyle(ButtonStyle.Danger),
    )];
  }
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`comp_winner_recheck:${id}`).setLabel('🔁 Recheck Link').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`comp_winner_reject:${id}`).setLabel('❌ Skip').setStyle(ButtonStyle.Danger),
  )];
}

// Groups paired boss competitions (e.g. Nightmare + Phosanis Nightmare, rolled and
// ending together) into one winner entry with summed KC, matching how /comp botw stats
// already merges them for live standings.
function groupEndedCompetitions(ended) {
  const byEndsAt = new Map();
  for (const c of ended) {
    const key = BOSS_METRICS.has(c.metric) ? `botw:${c.endsAt}` : `sotw:${c.id}`;
    if (!byEndsAt.has(key)) byEndsAt.set(key, []);
    byEndsAt.get(key).push(c);
  }
  return [...byEndsAt.values()];
}

async function checkEndedCompetitions(client) {
  const guildId = process.env.CLAN_GUILD_ID;
  if (!guildId || !process.env.WOM_GROUP_ID) return;

  const { data: cfg } = await supabase.from('guild_config').select('inactivity_channel_id, poll_channel_id').eq('guild_id', guildId).maybeSingle();
  if (!cfg?.inactivity_channel_id && !cfg?.poll_channel_id) return;

  let competitions;
  try {
    competitions = await getGroupCompetitions();
  } catch (err) {
    console.error(`[comp-winners] Failed to fetch competitions: ${err.message}`);
    return;
  }

  const now = Date.now();
  const ended = competitions.filter(c => {
    const endsAt = new Date(c.endsAt).getTime();
    return endsAt <= now && now - endsAt <= RECENT_WINDOW_MS && (BOSS_METRICS.has(c.metric) || SKILL_METRICS.has(c.metric));
  });
  if (!ended.length) return;

  for (const group of groupEndedCompetitions(ended)) {
    const primary = group[0];
    const competitionIds = group.map(c => c.id);
    const compType = BOSS_METRICS.has(primary.metric) ? 'botw' : 'sotw';

    const { data: existing } = await supabase.from('comp_winners').select('id').eq('guild_id', guildId).in('competition_id', competitionIds);
    if (existing?.length) continue; // already processed (any competition in this group)

    let standingsList;
    try {
      standingsList = await Promise.all(group.map(c => getCompetitionStandings(c.id)));
    } catch (err) {
      console.error(`[comp-winners] Failed to fetch standings for ${primary.id}: ${err.message}`);
      continue;
    }

    const byPlayer = new Map();
    for (const s of standingsList) {
      for (const p of s.participations ?? []) {
        const key = p.player.username.toLowerCase();
        if (!byPlayer.has(key)) byPlayer.set(key, { player: p.player, gained: 0 });
        byPlayer.get(key).gained += p.progress.gained;
      }
    }
    const ranked = [...byPlayer.values()].sort((a, b) => b.gained - a.gained);
    const top = ranked[0];

    const label = group.length > 1
      ? group.map(c => metricLabel(compType, c.metric)).join(' + ')
      : metricLabel(compType, primary.metric);

    if (cfg.poll_channel_id) {
      try {
        const pollChannel = await client.channels.fetch(cfg.poll_channel_id);
        const unit = compType === 'botw' ? 'kc' : 'xp';
        await pollChannel.send({ embeds: [buildCompetitionEndedEmbed({ compType, label, standings: standingsList, unit })] });
      } catch (err) {
        console.error(`[comp-winners] Failed to post public results for ${label}: ${err.message}`);
      }
    }

    if (!top || top.gained <= 0) {
      await supabase.from('comp_winners').insert(competitionIds.map(id => ({
        guild_id: guildId, competition_id: id, comp_type: compType, metric: primary.metric,
        title: label, ends_at: primary.endsAt, status: 'no_participants',
      })));
      console.log(`[comp-winners] ${label} ended with no participants — skipped`);
      continue;
    }

    if (!cfg.inactivity_channel_id) {
      // No mod channel configured — record as unactioned so this group isn't reprocessed, but skip the approval post.
      await supabase.from('comp_winners').insert(competitionIds.map(id => ({
        guild_id: guildId, competition_id: id, comp_type: compType, metric: primary.metric,
        title: label, ends_at: primary.endsAt, status: 'no_mod_channel',
      })));
      continue;
    }

    const winnerDiscordId = await findDiscordId(guildId, top.player.displayName);
    const unit = compType === 'botw' ? 'kc' : 'xp';

    const { data: row, error } = await supabase.from('comp_winners').insert({
      guild_id: guildId, competition_id: primary.id, comp_type: compType, metric: primary.metric,
      title: label, ends_at: primary.endsAt, winner_rsn: top.player.displayName,
      winner_discord_id: winnerDiscordId, gained: top.gained, status: 'pending',
    }).select().single();
    if (error) { console.error(`[comp-winners] Failed to insert row: ${error.message}`); continue; }

    // Record the sibling competition ids (paired bosses) as already-processed too.
    if (competitionIds.length > 1) {
      await supabase.from('comp_winners').insert(competitionIds.filter(id => id !== primary.id).map(id => ({
        guild_id: guildId, competition_id: id, comp_type: compType, metric: primary.metric,
        title: label, ends_at: primary.endsAt, status: 'merged',
      })));
    }

    try {
      const channel = await client.channels.fetch(cfg.inactivity_channel_id);
      const embed = buildApprovalEmbed({ compType, label, gained: top.gained, unit, winnerName: top.player.displayName, discordId: winnerDiscordId });
      const msg = await channel.send({ embeds: [embed], components: buildApprovalComponents(row.id, !!winnerDiscordId) });
      await supabase.from('comp_winners').update({ discord_message_id: msg.id, discord_channel_id: channel.id }).eq('id', row.id);
      console.log(`[comp-winners] Posted approval request for ${label} — ${winnerDiscordId ? top.player.displayName : 'NO DISCORD LINK'}`);
    } catch (err) {
      console.error(`[comp-winners] Failed to post approval message: ${err.message}`);
    }
  }
}

module.exports = { checkEndedCompetitions, findDiscordId, buildApprovalEmbed, buildApprovalComponents, metricLabel };
