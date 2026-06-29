const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadData } = require('../utils/storage');
const {
  BOTW_DISPLAY, HISTORY_SIZE, getBossPartners,
  nextCompWindow, rollCandidates, buildPollEmbed, buildPollComponents,
} = require('../utils/pollHelpers');
const { createPoll } = require('../utils/pollStorage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rollbotw')
    .setDescription('Roll 3 Boss of the Week options — community votes, auto-locks 10 min before start')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const data = loadData(guildId);
    const history = data.botwHistory ?? [];

    const { startsAt, endsAt } = nextCompWindow();
    const startsUnix = Math.floor(startsAt.getTime() / 1000);
    const endsUnix = Math.floor(endsAt.getTime() / 1000);
    const windowStr = `<t:${startsUnix}:f> → <t:${endsUnix}:f>`;
    const votingCutoff = new Date(startsAt.getTime() - 10 * 60 * 1000);
    const cutoffUnix = Math.floor(votingCutoff.getTime() / 1000);

    const recentNames = history.slice(-HISTORY_SIZE).map(b => BOTW_DISPLAY[b] ?? b);
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
      window_str: windowStr,
      recent_names: recentNames,
      pre_roll_history: history,
    };

    await interaction.reply({
      embeds: [buildPollEmbed(poll)],
      components: buildPollComponents(poll),
    });

    const msg = await interaction.fetchReply();
    poll.message_id = msg.id;
    await createPoll(poll);
  },
};
