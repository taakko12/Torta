const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
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
const OPTION_LABELS = ['1️⃣', '2️⃣', '3️⃣'];

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
    console.error(`[rollsotw] Missing env vars — WOM_GROUP_ID: ${groupId ? 'set' : 'MISSING'}, WOM_GROUP_VERIFICATION_CODE: ${verificationCode ? 'set' : 'MISSING'}`);
    return null;
  }
  console.log(`[rollsotw] Creating WOM competition: metric=${metric} groupId=${groupId} starts=${startsAt.toISOString()}`);
  try {
    const body = { title, metric, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), groupId: parseInt(groupId), groupVerificationCode: verificationCode };
    const res = await fetch('https://api.wiseoldman.net/v2/competitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'torta-clan-bot' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[rollsotw] WOM API ${res.status}: ${err}`);
      return null;
    }
    const json = await res.json();
    return json?.competition ?? json;
  } catch (e) {
    console.error(`[rollsotw] WOM API fetch error: ${e.message}`);
    return null;
  }
}

function buildComponents(candidates, voteCounts) {
  const voteRow = new ActionRowBuilder().addComponents(
    candidates.map((c, i) => new ButtonBuilder()
      .setCustomId(`sotw_vote_${i}`)
      .setLabel(`${OPTION_LABELS[i]} ${DISPLAY[c] ?? c} (${voteCounts[i].size})`)
      .setStyle(ButtonStyle.Primary)
    )
  );
  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sotw_accept').setLabel('✅ Accept Winner').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('sotw_reroll').setLabel('🔄 Reroll Options').setStyle(ButtonStyle.Secondary),
  );
  return [voteRow, controlRow];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rollsotw')
    .setDescription('Roll 3 Skill of the Week options — community votes, auto-locks 10 min before start')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const data = loadData(guildId);

    const history = data.sotwHistory ?? [];
    const recentSet = new Set(history.slice(-HISTORY_SIZE));
    const sessionRejected = new Set();

    const { startsAt, endsAt } = nextSotwWindow();
    const windowStr = `${formatCt(startsAt)} → ${formatCt(endsAt)}`;
    const votingCutoff = new Date(startsAt.getTime() - 10 * 60 * 1000);
    const cutoffUnix = Math.floor(votingCutoff.getTime() / 1000);
    const timeUntilCutoff = Math.max(60_000, votingCutoff.getTime() - Date.now());

    const recentNames = history.slice(-HISTORY_SIZE).map(s => DISPLAY[s] ?? s);

    const buildPool = () => SOTW_SKILLS.filter(s => !recentSet.has(s) && !sessionRejected.has(s));

    function rollCandidates() {
      let pool = buildPool();
      if (pool.length < 3) { sessionRejected.clear(); pool = buildPool(); }
      const result = [];
      const remaining = [...pool];
      while (result.length < 3 && remaining.length > 0) {
        const idx = Math.floor(Math.random() * remaining.length);
        result.push(remaining.splice(idx, 1)[0]);
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
        .setTitle('📈 Skill of the Week')
        .setColor(0x57f287)
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
      data.sotwHistory = [...history, winner].slice(-HISTORY_SIZE * 2);
      saveData(guildId, data);

      const title = `Skill of the Week — ${DISPLAY[winner] ?? winner}`;
      const comp = await createWomCompetition(winner, startsAt, endsAt, title);

      const finalEmbed = new EmbedBuilder()
        .setTitle(`📈 Skill of the Week — Locked In${autoClose ? ' (Auto)' : ''}`)
        .setColor(0x57f287)
        .setDescription(`## ${DISPLAY[winner] ?? winner}`)
        .addFields(
          { name: 'Competition window', value: windowStr },
          { name: 'Recent picks (excluded)', value: recentNames.length > 0 ? recentNames.join(', ') : 'None yet' },
        )
        .setTimestamp();

      if (comp?.id) {
        finalEmbed.addFields({ name: '🏆 WOM Competition', value: `[${title}](https://wiseoldman.net/competitions/${comp.id})` });
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
      if (i.customId.startsWith('sotw_vote_')) {
        const idx = parseInt(i.customId.slice(-1));
        if (isNaN(idx) || idx >= candidates.length) return;

        const prev = userVote.get(i.user.id);
        if (prev !== undefined) voteCounts[prev].delete(i.user.id);
        userVote.set(i.user.id, idx);
        voteCounts[idx].add(i.user.id);

        await i.update({ embeds: [buildEmbed()], components: buildComponents(candidates, voteCounts) });

      } else if (i.customId === 'sotw_accept') {
        if (!i.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          await i.reply({ content: '❌ Only moderators can accept.', ephemeral: true });
          return;
        }
        const winner = getWinner(candidates, voteCounts);
        const finalEmbed = await lockIn(winner);
        await i.update({ embeds: [finalEmbed], components: [] });
        collector.stop('accepted');

      } else if (i.customId === 'sotw_reroll') {
        if (!i.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          await i.reply({ content: '❌ Only moderators can reroll.', ephemeral: true });
          return;
        }
        for (const c of candidates) sessionRejected.add(c);
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
