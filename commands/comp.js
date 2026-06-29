const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { loadData, saveData, getBoard } = require('../utils/storage');
const { refreshLeaderboardMessage } = require('../utils/updateLeaderboard');
const { buildLeaderboardEmbed } = require('../utils/leaderboardEmbed');
const { MEDALS } = require('../utils/constants');
const {
  BOTW_DISPLAY, SOTW_DISPLAY, HISTORY_SIZE, getBossPartners,
  nextCompWindow, rollCandidates, buildPollEmbed, buildPollComponents,
} = require('../utils/pollHelpers');
const { createPoll } = require('../utils/pollStorage');
const { getCurrentBossCompetitions, getCurrentSkillCompetition, getCompetitionStandings } = require('../utils/wom');
const { buildCompetitionEmbed, humanize, formatNumber } = require('../utils/womEmbeds');

const BOTW = { key: 'botw', label: 'Boss of the Week', emoji: '💀', color: 0xed4245 };
const SOTW = { key: 'sotw', label: 'Skill of the Week', emoji: '📈', color: 0x57f287 };

// ── Shared win-board handlers ─────────────────────────────────────────────────

function execWins(interaction, cfg) {
  const user = interaction.options.getUser('user') ?? interaction.user;
  const board = getBoard(loadData(interaction.guildId), cfg.key);
  const wins = board.users[user.id]?.wins ?? 0;
  return interaction.reply(`${cfg.emoji} <@${user.id}> has **${wins}** ${cfg.label} win${wins === 1 ? '' : 's'}.`);
}

async function execLeaderboard(interaction, cfg) {
  const guildId = interaction.guildId;
  const data = loadData(guildId);
  const board = getBoard(data, cfg.key);
  const embed = buildLeaderboardEmbed(board, { title: `${cfg.emoji} ${cfg.label} Leaderboard`, color: cfg.color });
  const message = await interaction.channel.send({ embeds: [embed] });
  board.leaderboardMessage = { channelId: interaction.channel.id, messageId: message.id };
  saveData(guildId, data);
  return interaction.reply({ content: `📌 ${cfg.label} leaderboard posted! It will auto-update whenever wins change.`, flags: 64 });
}

function execAdd(interaction, cfg) {
  const guildId = interaction.guildId;
  const user = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount') ?? 1;
  const data = loadData(guildId);
  const board = getBoard(data, cfg.key);
  if (!board.users[user.id]) board.users[user.id] = { wins: 0 };
  board.users[user.id].wins += amount;
  saveData(guildId, data);
  refreshLeaderboardMessage(interaction.client, board, { title: `${cfg.emoji} ${cfg.label} Leaderboard`, color: cfg.color });
  return interaction.reply({
    content: `✅ Added **${amount}** ${cfg.label} win${amount === 1 ? '' : 's'} to <@${user.id}>. They now have **${board.users[user.id].wins}** total.`,
    flags: 64,
  });
}

function execRemove(interaction, cfg) {
  const guildId = interaction.guildId;
  const user = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount') ?? 1;
  const data = loadData(guildId);
  const board = getBoard(data, cfg.key);
  if (!board.users[user.id]) board.users[user.id] = { wins: 0 };
  board.users[user.id].wins = Math.max(0, board.users[user.id].wins - amount);
  saveData(guildId, data);
  refreshLeaderboardMessage(interaction.client, board, { title: `${cfg.emoji} ${cfg.label} Leaderboard`, color: cfg.color });
  return interaction.reply({
    content: `✅ Removed **${amount}** ${cfg.label} win${amount === 1 ? '' : 's'} from <@${user.id}>. They now have **${board.users[user.id].wins}** total.`,
    flags: 64,
  });
}

function execSet(interaction, cfg) {
  const guildId = interaction.guildId;
  const user = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');
  const data = loadData(guildId);
  const board = getBoard(data, cfg.key);
  if (!board.users[user.id]) board.users[user.id] = { wins: 0 };
  board.users[user.id].wins = amount;
  saveData(guildId, data);
  refreshLeaderboardMessage(interaction.client, board, { title: `${cfg.emoji} ${cfg.label} Leaderboard`, color: cfg.color });
  return interaction.reply({ content: `✅ Set <@${user.id}>'s ${cfg.label} wins to **${amount}**.`, flags: 64 });
}

// ── BOTW-specific handlers ────────────────────────────────────────────────────

async function execBotwStats(interaction) {
  await interaction.deferReply();
  const username = interaction.options.getString('username');
  try {
    const competitions = await getCurrentBossCompetitions();
    if (competitions.length === 0) return interaction.editReply('📭 No active Boss of the Week competition right now.');

    const standings = await Promise.all(competitions.map(c => getCompetitionStandings(c.id)));

    // Merge participations from 1–2 competitions, summing KC per player.
    const byPlayer = new Map();
    for (const s of standings) {
      for (const p of s.participations ?? []) {
        const key = p.player.username.toLowerCase();
        if (!byPlayer.has(key)) byPlayer.set(key, { player: p.player, gained: 0 });
        byPlayer.get(key).gained += p.progress.gained;
      }
    }
    const merged = [...byPlayer.values()].sort((a, b) => b.gained - a.gained);
    const bossLabel = standings.length > 1 ? standings.map(s => humanize(s.metric)).join(' + ') : humanize(standings[0].metric);
    const endsTs = Math.floor(new Date(competitions[0].endsAt).getTime() / 1000);

    if (username) {
      const entry = merged.find(e => e.player.username.toLowerCase() === username.toLowerCase());
      if (!entry) return interaction.editReply(`❌ **${username}** is not a participant in the current BOTW competition.`);
      return interaction.editReply({ embeds: [
        new EmbedBuilder()
          .setTitle(`📅 BOTW — ${entry.player.displayName}`)
          .setColor(BOTW.color)
          .setDescription(`**${bossLabel}** — ends <t:${endsTs}:R>`)
          .addFields({ name: 'KC Gained', value: `${formatNumber(entry.gained)} kc` })
          .setTimestamp(),
      ] });
    }

    const top = merged.filter(e => e.gained > 0).slice(0, 3);
    const embed = new EmbedBuilder()
      .setTitle('📅 Boss of the Week')
      .setColor(BOTW.color)
      .setDescription(`**${bossLabel}** — ends <t:${endsTs}:R>`)
      .setTimestamp();
    embed.addFields({ name: 'Top 3', value: top.length === 0
      ? 'No progress recorded yet.'
      : top.map((e, i) => `${MEDALS[i] ?? `${i + 1}.`} **${e.player.displayName}** — ${formatNumber(e.gained)} kc gained`).join('\n'),
    });
    if (standings.length > 1) embed.setFooter({ text: 'KC combined across both variants' });
    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error(`[comp botw stats] ${err.message}`);
    return interaction.editReply('❌ Could not fetch BOTW data from Wise Old Man. Try again in a bit.');
  }
}

async function execBotwRoll(interaction) {
  const guildId = interaction.guildId;
  const data = loadData(guildId);
  const history = data.botwHistory ?? [];
  const { startsAt, endsAt } = nextCompWindow();
  const startsUnix = Math.floor(startsAt.getTime() / 1000);
  const endsUnix = Math.floor(endsAt.getTime() / 1000);
  const votingCutoff = new Date(startsAt.getTime() - 10 * 60 * 1000);
  const cutoffUnix = Math.floor(votingCutoff.getTime() / 1000);
  const candidates = rollCandidates('botw', history, []);
  const poll = {
    guild_id: guildId,
    channel_id: interaction.channelId,
    poll_type: 'botw',
    candidates,
    session_rejected: candidates.flatMap(c => [c, ...getBossPartners(c)]),
    user_votes: {},
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    voting_cutoff: votingCutoff.toISOString(),
    cutoff_unix: cutoffUnix,
    window_str: `<t:${startsUnix}:f> → <t:${endsUnix}:f>`,
    recent_names: history.slice(-HISTORY_SIZE).map(b => BOTW_DISPLAY[b] ?? b),
    pre_roll_history: history,
  };
  await interaction.reply({ embeds: [buildPollEmbed(poll)], components: buildPollComponents(poll) });
  poll.message_id = (await interaction.fetchReply()).id;
  await createPoll(poll);
}

// ── SOTW-specific handlers ────────────────────────────────────────────────────

async function execSotwStats(interaction) {
  await interaction.deferReply();
  const username = interaction.options.getString('username');
  try {
    const competition = await getCurrentSkillCompetition();
    if (!competition) return interaction.editReply('📭 No active Skill of the Week competition right now.');
    const standings = await getCompetitionStandings(competition.id);

    if (username) {
      const entry = standings.participations?.find(p => p.player.username.toLowerCase() === username.toLowerCase());
      if (!entry) return interaction.editReply(`❌ **${username}** is not a participant in the current SOTW competition.`);
      return interaction.editReply({ embeds: [
        new EmbedBuilder()
          .setTitle(`📅 SOTW — ${entry.player.displayName}`)
          .setColor(SOTW.color)
          .setDescription(`**${humanize(competition.metric)}** — ends <t:${Math.floor(new Date(competition.endsAt).getTime() / 1000)}:R>`)
          .addFields({ name: 'XP Gained', value: `${formatNumber(entry.progress.gained)} xp` })
          .setTimestamp(),
      ] });
    }

    return interaction.editReply({ embeds: [buildCompetitionEmbed(competition, standings, { color: SOTW.color, unit: 'xp' })] });
  } catch (err) {
    console.error(`[comp sotw stats] ${err.message}`);
    return interaction.editReply('❌ Could not fetch SOTW data from Wise Old Man. Try again in a bit.');
  }
}

async function execSotwRoll(interaction) {
  const guildId = interaction.guildId;
  const data = loadData(guildId);
  const history = data.sotwHistory ?? [];
  const { startsAt, endsAt } = nextCompWindow();
  const startsUnix = Math.floor(startsAt.getTime() / 1000);
  const endsUnix = Math.floor(endsAt.getTime() / 1000);
  const votingCutoff = new Date(startsAt.getTime() - 10 * 60 * 1000);
  const cutoffUnix = Math.floor(votingCutoff.getTime() / 1000);
  const candidates = rollCandidates('sotw', history, []);
  const poll = {
    guild_id: guildId,
    channel_id: interaction.channelId,
    poll_type: 'sotw',
    candidates,
    session_rejected: [...candidates],
    user_votes: {},
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    voting_cutoff: votingCutoff.toISOString(),
    cutoff_unix: cutoffUnix,
    window_str: `<t:${startsUnix}:f> → <t:${endsUnix}:f>`,
    recent_names: history.slice(-HISTORY_SIZE).map(s => SOTW_DISPLAY[s] ?? s),
    pre_roll_history: history,
  };
  await interaction.reply({ embeds: [buildPollEmbed(poll)], components: buildPollComponents(poll) });
  poll.message_id = (await interaction.fetchReply()).id;
  await createPoll(poll);
}

// ── Command definition ────────────────────────────────────────────────────────

function addGroupSubcommands(group) {
  return group
    .addSubcommand(sub => sub
      .setName('stats')
      .setDescription('Show live WOM standings for the current competition')
      .addStringOption(opt => opt.setName('username').setDescription('Filter to a specific player'))
    )
    .addSubcommand(sub => sub
      .setName('wins')
      .setDescription("Check a member's all-time win count")
      .addUserOption(opt => opt.setName('user').setDescription('Member to check (defaults to you)'))
    )
    .addSubcommand(sub => sub
      .setName('leaderboard')
      .setDescription('Post the win leaderboard in this channel — admin only')
    )
    .addSubcommand(sub => sub
      .setName('roll')
      .setDescription('Roll 3 options for a community vote poll — admin only')
    )
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add win(s) to a member — admin only')
      .addUserOption(opt => opt.setName('user').setDescription('Member to award').setRequired(true))
      .addIntegerOption(opt => opt.setName('amount').setDescription('Wins to add (default 1)').setMinValue(1))
    )
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove win(s) from a member — admin only')
      .addUserOption(opt => opt.setName('user').setDescription('Member to adjust').setRequired(true))
      .addIntegerOption(opt => opt.setName('amount').setDescription('Wins to remove (default 1)').setMinValue(1))
    )
    .addSubcommand(sub => sub
      .setName('set')
      .setDescription("Set a member's win count directly — admin only")
      .addUserOption(opt => opt.setName('user').setDescription('Member to set').setRequired(true))
      .addIntegerOption(opt => opt.setName('amount').setDescription('Exact win count').setMinValue(0).setRequired(true))
    );
}

const ADMIN_SUBS = new Set(['leaderboard', 'roll', 'add', 'remove', 'set']);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('comp')
    .setDescription('Boss of the Week and Skill of the Week competitions')
    .addSubcommandGroup(group => addGroupSubcommands(group.setName('botw').setDescription('Boss of the Week')))
    .addSubcommandGroup(group => addGroupSubcommands(group.setName('sotw').setDescription('Skill of the Week'))),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();
    const cfg = group === 'botw' ? BOTW : SOTW;

    if (ADMIN_SUBS.has(sub) && !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ You need Manage Server permission.', flags: 64 });
    }

    if (sub === 'wins') return execWins(interaction, cfg);
    if (sub === 'leaderboard') return execLeaderboard(interaction, cfg);
    if (sub === 'add') return execAdd(interaction, cfg);
    if (sub === 'remove') return execRemove(interaction, cfg);
    if (sub === 'set') return execSet(interaction, cfg);

    if (group === 'botw') {
      if (sub === 'stats') return execBotwStats(interaction);
      if (sub === 'roll') return execBotwRoll(interaction);
    } else {
      if (sub === 'stats') return execSotwStats(interaction);
      if (sub === 'roll') return execSotwRoll(interaction);
    }
  },
};
