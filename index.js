require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { getRaid, updateRaid, getUpcomingRaids } = require('./utils/raidStorage');
const { buildRaidEmbed, buildRaidButtons } = require('./utils/raidEmbed');
const { loadPanel } = require('./utils/rolePanelStorage');
const { getPlanksChannelId, recordDeath } = require('./utils/plankStorage');
const { getDropsChannelId, recordDrop, parseLootEmbed, parseLootItems, parseLootImage, parseLootScreenshot, parseLootPlayer, parseLootItem } = require('./utils/dropStorage');
const { loadWelcome, addWelcomePending, resolveWelcomePending } = require('./utils/welcomeStorage');
const { startTrackscapeServer, sendToGame } = require('./utils/trackscapeServer');
const { loadTrackscape } = require('./utils/trackscapeStorage');
const { loadLoot, resolvePending } = require('./utils/lootStorage');
const { getPollByMessageId, updatePoll, getExpiredPolls } = require('./utils/pollStorage');
const { buildPollEmbed, buildPollComponents, lockInPoll, rollCandidates, getBossPartners } = require('./utils/pollHelpers');
const { isLootEmbed, dateToSnowflake, parseBroadcastDropEmbed, parseBroadcastAchievementEmbed } = require('./utils/messageHelper');
const { loadAnnounce, clearAnnounce } = require('./utils/announceStorage');
const { logDiscordMessage, logIngameMessage, logVcTime } = require('./utils/activityStorage');

const vcSessions = new Map(); // discordId -> { joinedAt, guildId, displayName, roleName }
let lastWomSync = 0;
let lastVcFlush = 0;
const { recordAchievement } = require('./utils/achievementStorage');
const { loadData, saveData } = require('./utils/storage');
const supabase = require('./utils/supabase');

const DEATH_QUIPS = [
  'skill issue 💀',
  'F in chat',
  'another one for the plank board',
  'the wilderness always wins',
  'rip the loot',
  'was it worth it?',
  'have you tried not dying?',
  'back to Lumbridge noob',
  'your items are in a better place now',
  'estimated loot dropped: your dignity',
  'PKed or just bad? (both)',
  'that one hurt to watch',
  'maybe try a safer spot next time',
  'bold strategy, did not pay off',
  'the plank leaderboard thanks you for your contribution',
  'just keep clicking man...',
  'bosh, really good',
  '80% chance this was tru',
  'fuck you pearl',
  '"dont you have like 1000 kc here? stop dying man"',
  'shoulda clicked the yellow pot, idiot',
  'no surprise there'
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  try {
    const command = require(path.join(commandsPath, file));
    client.commands.set(command.data.name, command);
  } catch (err) {
    console.error(`[startup] Failed to load command file "${file}": ${err.message}`);
  }
}

client.once('clientReady', () => {
  console.log(`[bot] Logged in as ${client.user.tag} (${client.commands.size} commands loaded)`);
  startTrackscapeServer(client, parseInt(process.env.PORT) || parseInt(process.env.TRACKSCAPE_PORT) || 3000);
  startReminderLoop();
  checkExpiredPolls().catch(e => console.error(`[poll] Startup check failed: ${e.message}`));
  setInterval(() => checkExpiredPolls().catch(e => console.error(`[poll] Interval check failed: ${e.message}`)), 60_000);
  setInterval(async () => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const { data: configs } = await supabase.from('guild_config')
      .select('guild_id, poll_channel_id, last_auto_roll_date')
      .not('poll_channel_id', 'is', null);
    const { rollPollToChannel } = require('./commands/comp');
    for (const cfg of configs ?? []) {
      if (cfg.last_auto_roll_date === today) continue;
      const guildData = await loadData(cfg.guild_id);
      const pollDay  = guildData.scheduledJobs?.pollRoll?.day  ?? 6;  // default Saturday
      const pollHour = guildData.scheduledJobs?.pollRoll?.hour ?? 12; // default 12 UTC
      if (now.getUTCDay() !== pollDay || now.getUTCHours() < pollHour) continue;
      const channel = await client.channels.fetch(cfg.poll_channel_id).catch(() => null);
      if (!channel) continue;
      try {
        await rollPollToChannel('botw', cfg.guild_id, channel, guildData);
        await rollPollToChannel('sotw', cfg.guild_id, channel, guildData);
        await supabase.from('guild_config').update({ last_auto_roll_date: today }).eq('guild_id', cfg.guild_id);
        console.log(`[auto-roll] Posted BOTW + SOTW polls for guild ${cfg.guild_id}`);
      } catch (err) {
        console.error(`[auto-roll] Failed for guild ${cfg.guild_id}: ${err.message}`);
      }
    }
  }, 60_000);

  setInterval(async () => {
    for (const [guildId] of client.guilds.cache) {
      const ann = loadAnnounce(guildId);
      if (!ann || Date.now() < ann.scheduledAt) continue;
      try {
        const ch = await client.channels.fetch(ann.channelId);
        const mentions = [...new Set(ann.content.match(/@everyone|@here|<@&\d+>|<@!?\d+>/g) ?? [])];
        await ch.send({
          content: mentions.length ? mentions.join(' ') : undefined,
          embeds: [new EmbedBuilder().setDescription(ann.content)],
          allowedMentions: { parse: ['everyone', 'roles', 'users'] },
        });
      } catch (err) {
        console.error(`[announce] Failed to post in guild ${guildId}: ${err.message}`);
      }
      clearAnnounce(guildId);
    }
  }, 60_000);
  setTimeout(() => retroParseAllGuilds().catch(err =>
    console.error(`[retro] Startup parse failed: ${err.message}`)
  ), 3000);
  setTimeout(() => retroScanIngameActivity().catch(err =>
    console.error(`[activity] Retro ingame scan failed: ${err.message}`)
  ), 10_000);
  setTimeout(() => retroScanDiscordActivity().catch(err =>
    console.error(`[activity] Retro Discord scan failed: ${err.message}`)
  ), 15_000);
  setTimeout(() => retroFillDiscordRoles().catch(err =>
    console.error(`[activity] Role backfill failed: ${err.message}`)
  ), 20_000);
  setTimeout(() => retroFillMonthCounts().catch(err =>
    console.error(`[activity] Month count backfill failed: ${err.message}`)
  ), 25_000);
  setTimeout(() => { lastWomSync = Date.now(); syncWomGroup(); }, 60_000);
  setInterval(async () => {
    const guildId = process.env.CLAN_GUILD_ID;
    const data = guildId ? await loadData(guildId).catch(() => ({})) : {};
    const intervalMs = (data.scheduledJobs?.womSync?.intervalHours ?? 1) * 3_600_000;
    if (Date.now() - lastWomSync >= intervalMs) {
      lastWomSync = Date.now();
      syncWomGroup().catch(e => console.error(`[wom] sync failed: ${e.message}`));
    }
  }, 300_000);

  // Seed vcSessions for members already in VC at startup
  const clanGuild = client.guilds.cache.get(process.env.CLAN_GUILD_ID);
  if (clanGuild) {
    for (const [, channel] of clanGuild.channels.cache) {
      if (channel.type !== 2 && channel.type !== 13) continue;
      for (const [, member] of channel.members) {
        if (member.user.bot) continue;
        const topRole = member.roles.cache.filter(r => r.name !== '@everyone').sort((a, b) => b.position - a.position).first()?.name ?? null;
        vcSessions.set(member.id, { joinedAt: Date.now(), guildId: clanGuild.id, displayName: member.displayName, roleName: topRole });
      }
    }
  }

  // Flush active VC sessions — interval configurable via website settings
  setInterval(async () => {
    const guildId = process.env.CLAN_GUILD_ID;
    const data = guildId ? await loadData(guildId).catch(() => ({})) : {};
    const intervalMs = (data.scheduledJobs?.vcFlush?.intervalMinutes ?? 5) * 60_000;
    if (Date.now() - lastVcFlush < intervalMs) return;
    lastVcFlush = Date.now();
    const now = Date.now();
    for (const [userId, session] of vcSessions) {
      const lastFlushed = session.lastFlushed ?? session.joinedAt;
      const minutes = Math.floor((now - lastFlushed) / 60_000);
      if (minutes > 0) {
        logVcTime(session.guildId, userId, session.displayName, session.roleName, minutes).catch(() => {});
        session.lastFlushed = now;
      }
    }
  }, 60_000);

  // Weekly recap + moderator recap (schedule configurable via website settings)
  setInterval(async () => {
    const now = new Date();
    const guildId = process.env.CLAN_GUILD_ID;
    if (!guildId) return;
    const data = await loadData(guildId).catch(() => ({}));
    const jobs = data.scheduledJobs ?? {};
    const weeklyDay  = jobs.weeklyRecap?.day  ?? 0;  // default Sunday
    const weeklyHour = jobs.weeklyRecap?.hour ?? 20; // default 8PM UTC
    const modDay     = jobs.modRecap?.day     ?? 1;  // default Monday
    const modHour    = jobs.modRecap?.hour    ?? 9;  // default 9AM UTC
    if (now.getUTCDay() === weeklyDay  && now.getUTCHours() === weeklyHour) postWeeklyRecap().catch(e => console.error(`[recap] ${e.message}`));
    if (now.getUTCDay() === modDay     && now.getUTCHours() === modHour)    postModeratorRecap().catch(e => console.error(`[modrecap] ${e.message}`));
  }, 3_600_000);

  // Monthly reset — day/hour configurable via website settings
  setInterval(async () => {
    const now = new Date();
    const guildId = process.env.CLAN_GUILD_ID;
    const data = guildId ? await loadData(guildId).catch(() => ({})) : {};
    const dayOfMonth = data.scheduledJobs?.monthlyReset?.dayOfMonth ?? 1;
    const hour       = data.scheduledJobs?.monthlyReset?.hour       ?? 0;
    if (now.getUTCDate() !== dayOfMonth || now.getUTCHours() !== hour) return;
    await Promise.all([
      supabase.from('discord_activity').update({ month_count: 0 }).gte('month_count', 0),
      supabase.from('ingame_activity').update({ month_count: 0 }).gte('month_count', 0),
      supabase.from('vc_activity').update({ month_minutes: 0 }).gte('month_minutes', 0),
    ]);
    console.log('[activity] Monthly counts reset');
  }, 3_600_000);
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    // Non-blocking command log
    supabase.from('command_logs').insert({
      guild_id: interaction.guildId,
      discord_id: interaction.user.id,
      display_name: interaction.member?.displayName ?? interaction.user.username,
      command: interaction.commandName,
      subcommand: (() => { try { return interaction.options.getSubcommand() } catch { return null } })(),
      channel_id: interaction.channelId,
    }).then().catch(() => {});

    try {
      await command.execute(interaction);
    } catch (err) {
      const label = `/${interaction.commandName}`;
      console.error(`[command] ${label} failed for user ${interaction.user.tag}: ${err.message}`);
      const errorReply = { content: '❌ Something went wrong running that command.', flags: 64 };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorReply).catch(() => {});
      } else {
        await interaction.reply(errorReply).catch(() => {});
      }
    }
    return;
  }

  if (interaction.isButton()) {
    const [action, ...rest] = interaction.customId.split(':');
    const payload = rest.join(':');

    // Role panel toggle
    if (action === 'rolepanel') {
      const roleId = payload;
      const panel = await loadPanel(interaction.guildId);
      const entry = panel.roles.find(r => r.roleId === roleId);
      if (!entry) {
        return interaction.reply({ content: '❌ That role is no longer on the panel.', flags: 64 });
      }

      const member = interaction.member;
      const hasRole = member.roles.cache.has(roleId);

      try {
        if (hasRole) {
          await member.roles.remove(roleId);
          await interaction.reply({ content: `✅ Removed ${entry.emoji} **${entry.label}** from your roles.`, flags: 64 });
        } else {
          await member.roles.add(roleId);
          await interaction.reply({ content: `✅ Added ${entry.emoji} **${entry.label}** to your roles.`, flags: 64 });
        }
      } catch (err) {
        console.error(`[rolepanel] Failed to toggle role ${roleId} for ${interaction.user.tag}: ${err.message}`);
        await interaction.reply({ content: '❌ Could not update your roles. Make sure the bot role is above the roles it manages.', flags: 64 });
      }
      return;
    }

    // Welcome / TOS agree button — queue for mod approval
    if (action === 'welcome_agree') {
      const guildId = interaction.guildId;
      const welcome = await loadWelcome(guildId);

      if (welcome.roleId && interaction.member.roles.cache.has(welcome.roleId)) {
        return interaction.reply({ content: '✅ You already have the member role!', flags: 64 });
      }

      if (!welcome.modChannelId) {
        // Fallback: auto-grant if no mod channel configured
        if (!welcome.roleId) {
          return interaction.reply({ content: '✅ Rules acknowledged! (Ask an admin to run `/welcome setrole` and `/welcome setmodchannel`.)', flags: 64 });
        }
        try {
          await interaction.member.roles.add(welcome.roleId);
          return interaction.reply({ content: '✅ Welcome to the clan! You now have full access.', flags: 64 });
        } catch (err) {
          console.error(`[welcome] Failed to add role: ${err.message}`);
          return interaction.reply({ content: '❌ Could not assign your role. Let an admin know.', flags: 64 });
        }
      }

      const modChannel = await interaction.client.channels.fetch(welcome.modChannelId).catch(() => null);
      if (!modChannel) {
        return interaction.reply({ content: '❌ Mod channel not found. Let an admin know.', flags: 64 });
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 TOS Approval Request')
        .setColor(0xf1c40f)
        .addFields(
          { name: 'User', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
          { name: 'Agreed at', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp();

      const approvalMsg = await modChannel.send({ embeds: [embed], components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('welcome_modapprove:PLACEHOLDER').setLabel('✅ Approve').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('welcome_modreject:PLACEHOLDER').setLabel('❌ Reject').setStyle(ButtonStyle.Danger)
        )
      ]});

      await approvalMsg.edit({ components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`welcome_modapprove:${approvalMsg.id}`).setLabel('✅ Approve').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`welcome_modreject:${approvalMsg.id}`).setLabel('❌ Reject').setStyle(ButtonStyle.Danger)
        )
      ]});

      addWelcomePending(guildId, welcome, approvalMsg.id, { userId: interaction.user.id });

      return interaction.reply({ content: '✅ Thanks for agreeing to the rules! A mod will review your application shortly.', flags: 64 });
    }

    // Mod approves/rejects a TOS application
    if (action === 'welcome_modapprove' || action === 'welcome_modreject') {
      const guildId = interaction.guildId;
      const welcome = await loadWelcome(guildId);
      const entry = resolveWelcomePending(guildId, welcome, payload);

      if (!entry) {
        return interaction.reply({ content: '❌ This request has already been resolved.', flags: 64 });
      }

      await interaction.message.delete().catch(() => {});

      if (action === 'welcome_modapprove') {
        if (!welcome.roleId) {
          return interaction.reply({ content: '❌ No member role set. Run `/welcome setrole` first.', flags: 64 });
        }
        try {
          const member = await interaction.guild.members.fetch(entry.userId);
          await member.roles.add(welcome.roleId);
          console.log(`[welcome] Approved ${member.user.tag} by ${interaction.user.tag}`);
        } catch (err) {
          console.error(`[welcome] Failed to grant role to ${entry.userId}: ${err.message}`);
        }
        await interaction.client.users.fetch(entry.userId)
          .then(u => u.send('✅ You\'ve been approved and now have full access to the clan. Welcome!').catch(() => {}))
          .catch(() => {});
        return interaction.reply({ content: `✅ Approved <@${entry.userId}>.`, flags: 64 });
      } else {
        await interaction.client.users.fetch(entry.userId)
          .then(u => u.send('❌ Your clan application was not approved at this time. Contact a mod if you have questions.').catch(() => {}))
          .catch(() => {});
        return interaction.reply({ content: `❌ Rejected <@${entry.userId}>.`, flags: 64 });
      }
    }

    // Raid complete button (admin only)
    if (action === 'raid_complete') {
      const raidId = payload;
      const guildId = interaction.guildId;

      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: '❌ Only admins can mark a raid as complete.', flags: 64 });
      }

      const raid = await getRaid(raidId);
      if (!raid) {
        return interaction.reply({ content: '❌ This raid no longer exists.', flags: 64 });
      }
      if (raid.attendees) {
        return interaction.reply({ content: '❌ This raid is already marked complete.', flags: 64 });
      }

      await updateRaid(raidId, { attendees: raid.signups });
      const updatedRaid = { ...raid, attendees: raid.signups };
      await interaction.update({
        embeds: [buildRaidEmbed(updatedRaid)],
        components: buildRaidButtons(raidId, true)
      }).catch(err => console.error(`[button] Failed to update raid embed on complete: ${err.message}`));
      return;
    }

    // Loot approve/reject
    if (action === 'loot_approve' || action === 'loot_reject') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: '❌ Only admins can approve or reject submissions.', flags: 64 });
      }

      const messageId = payload;
      const guildId = interaction.guildId;
      const lootData = await loadLoot(guildId);
      const entry = resolvePending(guildId, lootData, messageId);

      if (!entry) {
        return interaction.reply({ content: '❌ This submission has already been resolved.', flags: 64 });
      }

      const oldEmbed = interaction.message.embeds[0];
      const newEmbed = EmbedBuilder.from(oldEmbed);

      if (action === 'loot_approve') {
        await recordDrop(guildId, entry.rsn, entry.gpValue, entry.item ?? null);
        newEmbed.setTitle('💰 Loot Submission — Approved');
        newEmbed.setColor(0x57f287);
        newEmbed.addFields({ name: 'Reviewed by', value: `<@${interaction.user.id}>`, inline: true });
        await interaction.update({ embeds: [newEmbed], components: [] });
        try {
          const submitter = await interaction.client.users.fetch(entry.userId);
          await submitter.send(`✅ Your loot submission of **${entry.item ?? entry.gpValue + ' gp'}** has been approved and added to the leaderboard!`).catch(() => {});
        } catch {}
        console.log(`[loot] Approved ${entry.gpValue.toLocaleString()} gp for "${entry.rsn}" by ${interaction.user.tag}`);
      } else {
        newEmbed.setTitle('💰 Loot Submission — Rejected');
        newEmbed.setColor(0xed4245);
        newEmbed.addFields({ name: 'Rejected by', value: `<@${interaction.user.id}>`, inline: true });
        await interaction.update({ embeds: [newEmbed], components: [] });
        try {
          await interaction.client.users.fetch(entry.userId).then(u =>
            u.send(`❌ Your loot submission was rejected. If you think this is a mistake, contact an admin.`).catch(() => {})
          );
        } catch {}
        console.log(`[loot] Rejected submission for "${entry.rsn}" by ${interaction.user.tag}`);
      }
      return;
    }

    // Poll vote/control buttons — looked up from Supabase so redeploys don't break active polls
    if (/^(botw|sotw)_(vote_\d|accept)$/.test(interaction.customId)) {
      const poll = await getPollByMessageId(interaction.message.id);
      if (!poll) {
        return interaction.reply({ content: '❌ This poll is no longer active.', flags: 64 });
      }
      const id = interaction.customId;

      if (/_vote_\d$/.test(id)) {
        const idx = parseInt(id.slice(-1));
        if (isNaN(idx) || idx >= poll.candidates.length) return;
        const userVotes = { ...poll.user_votes, [interaction.user.id]: idx };
        await updatePoll(poll.id, { user_votes: userVotes });
        return interaction.update({
          embeds: [buildPollEmbed({ ...poll, user_votes: userVotes })],
          components: buildPollComponents({ ...poll, user_votes: userVotes }),
        });
      }

      if (id.endsWith('_accept')) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.reply({ content: '❌ Only moderators can accept.', flags: 64 });
        }
        await interaction.deferUpdate();
        return lockInPoll(poll, client, false);
      }

      return;
    }

    if (action === 'announce_download') {
      const ann = loadAnnounce(interaction.guildId);
      if (!ann) return interaction.reply({ content: '❌ No announcement scheduled.', flags: 64 });
      const buf = Buffer.from(ann.content, 'utf8');
      return interaction.reply({ files: [new AttachmentBuilder(buf, { name: 'announcement.md' })], flags: 64 });
    }

    if (action === 'announce_cancel_btn') {
      clearAnnounce(interaction.guildId);
      return interaction.update({ content: '🗑️ Announcement cancelled.', embeds: [], components: [] });
    }

    if (action === 'rsvp') {
      const [eventId, response] = payload.split(':');
      const userId = interaction.user.id;
      const displayName = interaction.member?.displayName ?? interaction.user.username;
      try {
        if (response === 'going') {
          await supabase.from('event_rsvps').upsert({ event_id: eventId, discord_id: userId, display_name: displayName, response: 'going' }, { onConflict: 'event_id,discord_id' });
          return interaction.reply({ content: "✅ You're going! See you there.", flags: 64 });
        } else {
          await supabase.from('event_rsvps').delete().eq('event_id', eventId).eq('discord_id', userId);
          return interaction.reply({ content: "Got it, you won't be attending.", flags: 64 });
        }
      } catch (err) {
        console.error(`[rsvp] Failed for event ${eventId}, user ${userId}:`, err.message);
        return interaction.reply({ content: '❌ Could not save your RSVP. Try again in a moment.', flags: 64 }).catch(() => {});
      }
    }

    if (action !== 'raid_signup' && action !== 'raid_dropout') return;
    const raidId = payload;
    const guildId = interaction.guildId;

    const raid = await getRaid(raidId);
    if (!raid) {
      await interaction.reply({ content: '❌ This raid no longer exists.', flags: 64 });
      return;
    }
    if (raid.attendees) {
      return interaction.reply({ content: '❌ This raid is already complete.', flags: 64 });
    }

    const userId = interaction.user.id;
    const username = interaction.user.username;
    const alreadyIn = raid.signups.some(u => u.id === userId);

    if (action === 'raid_signup') {
      if (alreadyIn) {
        return interaction.reply({ content: "You're already signed up!", flags: 64 });
      }
      raid.signups.push({ id: userId, username });
    } else {
      if (!alreadyIn) {
        return interaction.reply({ content: "You're not signed up.", flags: 64 });
      }
      raid.signups = raid.signups.filter(u => u.id !== userId);
    }

    await updateRaid(raidId, { signups: raid.signups });

    await interaction.update({
      embeds: [buildRaidEmbed(raid)],
      components: buildRaidButtons(raidId)
    }).catch(err => console.error(`[button] Failed to update raid embed: ${err.message}`));

    return;
  }

});

// Watch configured channels for Dink death and loot webhook messages
client.on('messageCreate', async message => {
  if (!message.guildId) return;

  const guildId = message.guildId;

  // Track Discord message activity (clan guild only)
  if (!message.author?.bot && !message.webhookId && guildId === process.env.CLAN_GUILD_ID) {
    const displayName = message.member?.displayName ?? message.author?.username ?? 'Unknown';
    const topRole = message.member?.roles?.cache?.filter(r => r.name !== '@everyone')?.sort((a, b) => b.position - a.position)?.first()?.name ?? null;
    logDiscordMessage(guildId, message.author.id, displayName, topRole).catch(() => {});
  }

  // Relay regular Discord messages to in-game clan chat via TrackScape WebSocket
  if (!message.webhookId && !message.author?.bot && message.content) {
    const tsConfig = await loadTrackscape(guildId);
    if (tsConfig.clanChatChannelId && message.channelId === tsConfig.clanChatChannelId && tsConfig.verificationCode) {
      const displayName = message.member?.displayName ?? message.author.username;
      sendToGame(tsConfig.verificationCode, displayName, message.content);
    }
  }

  // TrackScape posts broadcasts as a bot account (not a webhook) — handle before the webhook gate.
  if (message.author?.bot && !message.webhookId) {
    const tsConfig = await loadTrackscape(guildId);
    if (tsConfig.broadcastChannelId && message.channelId === tsConfig.broadcastChannelId) {
      for (let i = 0; i < (message.embeds ?? []).length; i++) {
        const embed = message.embeds[i];
        const drop = parseBroadcastDropEmbed(embed);
        if (drop && drop.value > 0) {
          await recordDrop(guildId, drop.player, drop.value, drop.item, null, null, message.id, i);
          console.log(`[broadcast] Drop ${drop.value.toLocaleString()} gp (${drop.item}) for "${drop.player}" in guild ${guildId}`);
          continue;
        }
        const achievement = parseBroadcastAchievementEmbed(embed);
        if (achievement) {
          await recordAchievement(guildId, achievement.player, achievement.title, achievement.description, message.id, i);
          console.log(`[broadcast] Achievement "${achievement.title}" for "${achievement.player}" in guild ${guildId}`);
        }
      }
    }
    return;
  }

  if (!message.webhookId) return;

  const [planksChannelId, dropsChannelId] = await Promise.all([
    getPlanksChannelId(guildId),
    getDropsChannelId(guildId),
  ]);

  if (planksChannelId && message.channelId === planksChannelId) {
    const playerName = parseDeathMessage(message);
    if (playerName) {
      const deathImage = parseDeathImage(message);
      await recordDeath(guildId, playerName, message.id, deathImage);
      console.log(`[planks] Recorded death for "${playerName}" in guild ${guildId}`);
      if (Math.random() < 0.4) {
        const quip = DEATH_QUIPS[Math.floor(Math.random() * DEATH_QUIPS.length)];
        message.channel.send(`**${playerName}** — ${quip}`).catch(() => {});
      }
    }
  }

  if (dropsChannelId && message.channelId === dropsChannelId) {
    let dropIdx = 0;
    for (const embed of message.embeds) {
      if (!isLootEmbed(embed)) continue;
      const playerName = parseLootPlayer(embed, message.content);
      if (!playerName) continue;
      const imageUrl = parseLootImage(embed);
      const screenshotUrl = parseLootScreenshot(embed, message);
      for (const { item, gpValue } of parseLootItems(embed)) {
        await recordDrop(guildId, playerName, gpValue, item, imageUrl, screenshotUrl, message.id, dropIdx);
        console.log(`[loot] Recorded ${gpValue.toLocaleString()} gp (${item}) for "${playerName}" in guild ${guildId}`);
        dropIdx++;
      }
    }
  }
});

function parseDeathImage(message) {
  // Dink sends the screenshot as an image in the embed or as an attachment
  for (const embed of (message.embeds ?? [])) {
    if (embed.image?.url) return embed.image.url;
    if (embed.thumbnail?.url) return embed.thumbnail.url;
  }
  return message.attachments?.first()?.url ?? null;
}

function parseDeathMessage(message) {
  if (message.embeds.length > 0) {
    for (const embed of message.embeds) {
      const title = embed.title ?? '';
      const desc = embed.description ?? '';
      const authorName = embed.author?.name ?? '';

      const isDeathEmbed =
        /death/i.test(title) ||
        /has died/i.test(desc) ||
        /has just been pked/i.test(desc);

      if (isDeathEmbed) {
        const match = desc.match(/^(.+?) has (?:died|just been pked)/i);
        if (match) return match[1].trim();
        if (authorName) return authorName.trim();
        break;
      }
    }
  }

  if (message.content) {
    const match = message.content.match(/^(.+?) has (?:died|just been pked)/i);
    if (match) return match[1].trim();
  }

  return null;
}


client.on('voiceStateUpdate', async (oldState, newState) => {
  const guildId = (newState.guild ?? oldState.guild)?.id;
  if (guildId !== process.env.CLAN_GUILD_ID) return;

  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;
  const userId = member.id;

  const joined = !oldState.channelId && newState.channelId;
  const left = oldState.channelId && !newState.channelId;

  if (joined) {
    const topRole = member.roles.cache.filter(r => r.name !== '@everyone').sort((a, b) => b.position - a.position).first()?.name ?? null;
    vcSessions.set(userId, { joinedAt: Date.now(), guildId, displayName: member.displayName, roleName: topRole });
  } else if (left) {
    const session = vcSessions.get(userId);
    if (session) {
      const since = session.lastFlushed ?? session.joinedAt;
      const minutes = Math.floor((Date.now() - since) / 60_000);
      if (minutes > 0) logVcTime(guildId, userId, session.displayName, session.roleName, minutes).catch(() => {});
      vcSessions.delete(userId);
    }
  }
});

client.on('error', err => console.error(`[discord] Client error: ${err.message}`));

async function checkExpiredPolls() {
  const expired = await getExpiredPolls();
  for (const poll of expired) {
    await lockInPoll(poll, client, true).catch(e =>
      console.error(`[poll] Auto lock-in failed for ${poll.id}: ${e.message}`)
    );
  }
}

function startReminderLoop() {
  setInterval(() => {
    checkRaidReminders().catch(err =>
      console.error(`[reminders] Unexpected error in reminder loop: ${err.message}`)
    );
  }, 5 * 60 * 1000);
}

async function checkRaidReminders() {
  const now = Math.floor(Date.now() / 1000);

  const upcomingRaids = await getUpcomingRaids();
  for (const raid of upcomingRaids) {
    const secondsUntil = raid.timestamp - now;
    const in24h = secondsUntil <= 86400 && secondsUntil > 86100;
    const in1h  = secondsUntil <= 3600  && secondsUntil > 3300;

    if (in24h && !raid.reminded24h) {
      console.log(`[reminders] Sending 24h reminder for raid "${raid.name}" in guild ${raid.guildId}`);
      await sendReminder(raid, '24 hours');
      await updateRaid(raid.id, { reminded24h: true });
    } else if (in1h && !raid.reminded1h) {
      console.log(`[reminders] Sending 1h reminder for raid "${raid.name}" in guild ${raid.guildId}`);
      await sendReminder(raid, '1 hour');
      await updateRaid(raid.id, { reminded1h: true });
    }
  }
}

async function sendReminder(raid, timeLabel) {
  try {
    const channel = await client.channels.fetch(raid.channelId);
    if (!channel) {
      console.warn(`[reminders] Channel ${raid.channelId} not found for raid "${raid.name}" — skipping`);
      return;
    }

    const mentions = raid.signups.map(u => `<@${u.id}>`).join(' ');
    const embed = new EmbedBuilder()
      .setTitle(`⏰ Raid Reminder — ${raid.name}`)
      .setColor(0xe67e22)
      .setDescription(`Starting <t:${raid.timestamp}:R> (<t:${raid.timestamp}:F>)`)
      .setTimestamp();

    const content = raid.signups.length > 0
      ? `${mentions} — your raid starts in **${timeLabel}**!`
      : `Raid starting in **${timeLabel}**!`;

    await channel.send({ content, embeds: [embed] });
  } catch (err) {
    console.error(`[reminders] Failed to send reminder for raid "${raid.name}": ${err.message}`);
  }
}

async function retroParseAllGuilds() {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) return;

  const guildDirs = fs.readdirSync(dataDir).filter(d =>
    fs.statSync(path.join(dataDir, d)).isDirectory()
  );

  for (const guildId of guildDirs) {
    await retroParseGuild(guildId).catch(err =>
      console.error(`[retro] Failed for guild ${guildId}: ${err.message}`)
    );
  }
}

async function retroParseGuild(guildId) {
  const [planksChannelId, dropsChannelId] = await Promise.all([
    getPlanksChannelId(guildId),
    getDropsChannelId(guildId),
  ]);

  if (!planksChannelId && !dropsChannelId) return;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const afterSnowflake = dateToSnowflake(monthStart);

  if (planksChannelId) {
    console.log(`[retro] Scanning planks channel for missed deaths in guild ${guildId}`);
    const messages = await fetchMessagesAfter(planksChannelId, afterSnowflake);
    let inserted = 0;
    for (const msg of messages) {
      if (!msg.webhookId) continue;
      const name = parseDeathMessage(msg);
      if (name) {
        await recordDeath(guildId, name, msg.id, parseDeathImage(msg));
        inserted++;
      }
    }
    console.log(`[retro] Planks: processed ${messages.length} messages, ${inserted} deaths`);
  }

  if (dropsChannelId) {
    console.log(`[retro] Scanning drops channel for missed loot in guild ${guildId}`);
    const messages = await fetchMessagesAfter(dropsChannelId, afterSnowflake);
    let inserted = 0;
    for (const msg of messages) {
      for (let i = 0; i < (msg.embeds ?? []).length; i++) {
        const embed = msg.embeds[i];
        if (!isLootEmbed(embed)) continue;
        const name = parseLootPlayer(embed, msg.content);
        const gp = parseLootEmbed(embed);
        if (name && gp > 0) {
          await recordDrop(guildId, name, gp, parseLootItem(embed), parseLootImage(embed), parseLootScreenshot(embed, msg), msg.id, i);
          inserted++;
        }
      }
    }
    console.log(`[retro] Drops: processed ${messages.length} messages, ${inserted} loot entries`);
  }
}

async function fetchMessagesAfter(channelId, afterSnowflake) {
  const all = [];
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return all;

    let lastId = afterSnowflake;
    while (true) {
      const batch = await channel.messages.fetch({ limit: 100, after: lastId });
      if (batch.size === 0) break;

      const msgs = [...batch.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      all.push(...msgs);
      lastId = msgs[msgs.length - 1].id;
      if (batch.size < 100) break;
    }
  } catch (err) {
    console.error(`[retro] Failed to fetch from channel ${channelId}: ${err.message}`);
  }
  return all;
}


async function postWeeklyRecap() {
  const guildId = process.env.CLAN_GUILD_ID;
  if (!guildId) return;
  const { data: cfg } = await supabase.from('guild_config').select('recap_channel_id').eq('guild_id', guildId).maybeSingle();
  if (!cfg?.recap_channel_id) return;

  const [{ data: discord }, { data: ingame }, { data: vc }, { data: topLoot }] = await Promise.all([
    supabase.from('discord_activity').select('display_name, month_count').eq('guild_id', guildId).order('month_count', { ascending: false }).limit(3),
    supabase.from('ingame_activity').select('rsn, month_count').eq('guild_id', guildId).order('month_count', { ascending: false }).limit(3),
    supabase.from('vc_activity').select('display_name, month_minutes').eq('guild_id', guildId).order('month_minutes', { ascending: false }).limit(3),
    supabase.from('drops').select('player_name, gp_value, item_name').eq('guild_id', guildId).gte('recorded_at', new Date(Date.now() - 7 * 86400_000).toISOString()).order('gp_value', { ascending: false }).limit(3),
  ]);

  const medals = ['🥇', '🥈', '🥉'];
  const fmtRows = (rows, nameKey, countKey, suffix) =>
    rows?.length ? rows.map((r, i) => `${medals[i]} **${r[nameKey]}** — ${Number(r[countKey]).toLocaleString()} ${suffix}`).join('\n') : 'No data yet';

  const channel = await client.channels.fetch(cfg.recap_channel_id).catch(() => null);
  if (!channel) return;

  const embeds = [new EmbedBuilder()
    .setTitle('📊 Weekly Activity Recap')
    .setColor(0x7c5ce8)
    .addFields(
      { name: '💬 Top Discord Chatters', value: fmtRows(discord, 'display_name', 'month_count', 'msgs'), inline: true },
      { name: '⚔️ Top In-Game Chatters', value: fmtRows(ingame, 'rsn', 'month_count', 'msgs'), inline: true },
      { name: '🔊 Most VC Time', value: fmtRows(vc, 'display_name', 'month_minutes', 'min'), inline: true },
    )
    .setFooter({ text: 'Based on activity so far this month' })
  ];

  if (topLoot?.length) {
    const lootLines = topLoot.map((d, i) => `${medals[i]} **${d.player_name}** — ${d.item_name ?? 'drop'} (${Number(d.gp_value).toLocaleString()} gp)`).join('\n');
    embeds.push(new EmbedBuilder().setTitle('💰 Top Drops This Week').setDescription(lootLines).setColor(0xc89b3c));
  }

  embeds[embeds.length - 1].setTimestamp();
  await channel.send({ embeds });
  console.log('[recap] Weekly recap posted');
}

async function postModeratorRecap() {
  const guildId = process.env.CLAN_GUILD_ID;
  if (!guildId) return;
  const { data: cfg } = await supabase.from('guild_config').select('inactivity_channel_id').eq('guild_id', guildId).maybeSingle();
  if (!cfg?.inactivity_channel_id) return;
  const channel = await client.channels.fetch(cfg.inactivity_channel_id).catch(() => null);
  if (!channel) return;

  const [
    { data: inactive },
    { data: allLinks },
    { data: allDiscord },
    { data: allIngame },
  ] = await Promise.all([
    supabase.from('discord_activity').select('display_name, role_name, last_message_at').eq('guild_id', guildId).eq('month_count', 0).order('last_message_at', { ascending: true, nullsFirst: true }).limit(20),
    supabase.from('rsn_links').select('discord_id, rsn').eq('guild_id', guildId),
    supabase.from('discord_activity').select('discord_id, display_name').eq('guild_id', guildId),
    supabase.from('ingame_activity').select('rsn').eq('guild_id', guildId),
  ]);

  const linkedDiscordIds = new Set((allLinks ?? []).map(l => l.discord_id));
  const linkedRsns = new Set((allLinks ?? []).map(l => l.rsn.toLowerCase()));
  const unlinkedDiscord = (allDiscord ?? []).filter(d => !linkedDiscordIds.has(d.discord_id));
  const unlinkedIngame = (allIngame ?? []).filter(i => !linkedRsns.has(i.rsn.toLowerCase()));

  const embeds = [];

  // Inactive members
  if (inactive?.length) {
    const lines = inactive.map(m => {
      const last = m.last_message_at ? new Date(m.last_message_at).toLocaleDateString('en-GB') : 'never';
      return `• **${m.display_name}** (${m.role_name ?? 'Unknown'}) — last seen ${last}`;
    }).join('\n');
    embeds.push(new EmbedBuilder()
      .setTitle('⚠️ Inactive Members This Month')
      .setDescription(lines)
      .setColor(0xED4245)
      .setFooter({ text: `${inactive.length} members with 0 Discord messages this month` }));
  }

  // Unlinked members
  const unlinkLines = [];
  if (unlinkedDiscord.length) unlinkLines.push(`**Discord → no RSN (${unlinkedDiscord.length}):**\n${unlinkedDiscord.slice(0, 15).map(d => `• ${d.display_name ?? d.discord_id}`).join('\n')}`);
  if (unlinkedIngame.length) unlinkLines.push(`**In-game → no Discord (${unlinkedIngame.length}):**\n${unlinkedIngame.slice(0, 15).map(i => `• ${i.rsn}`).join('\n')}`);
  if (unlinkLines.length) {
    embeds.push(new EmbedBuilder()
      .setTitle('🔗 Unlinked Members')
      .setDescription(unlinkLines.join('\n\n'))
      .setColor(0xc89b3c));
  }

  if (!embeds.length) return;
  embeds[embeds.length - 1].setTimestamp();
  await channel.send({ content: '📋 **Weekly Moderator Recap**', embeds });
  console.log(`[modrecap] Posted: ${inactive?.length ?? 0} inactive, ${unlinkedDiscord.length} unlinked Discord, ${unlinkedIngame.length} unlinked RSN`);
}

async function retroFillDiscordRoles() {
  const guildId = process.env.CLAN_GUILD_ID;
  if (!guildId) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const data = await loadData(guildId);
  if (data.discordRolesFilled) return;

  const { data: rows } = await supabase.from('discord_activity').select('discord_id').eq('guild_id', guildId);
  if (!rows?.length) return;

  let updated = 0;
  for (const { discord_id } of rows) {
    try {
      const member = await guild.members.fetch(discord_id);
      const topRole = member.roles.cache.filter(r => r.name !== '@everyone').sort((a, b) => b.position - a.position).first()?.name ?? null;
      if (topRole) {
        await supabase.from('discord_activity').update({ role_name: topRole }).eq('guild_id', guildId).eq('discord_id', discord_id);
        updated++;
      }
    } catch {}
  }

  data.discordRolesFilled = true;
  await saveData(guildId, data);
  console.log(`[activity] Backfilled roles for ${updated} Discord members`);
}

async function retroFillMonthCounts() {
  const guildId = process.env.CLAN_GUILD_ID;
  if (!guildId) return;

  const data = await loadData(guildId);
  if (data.monthCountFilled) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthSnowflake = dateToSnowflake(monthStart);

  // Discord: count this month's messages per user
  const discordCounts = new Map();
  for (const [, channel] of guild.channels.cache) {
    if (channel.type !== 0) continue;
    const messages = await fetchMessagesAfter(channel.id, monthSnowflake);
    for (const msg of messages) {
      if (msg.author?.bot || msg.webhookId) continue;
      discordCounts.set(msg.author.id, (discordCounts.get(msg.author.id) ?? 0) + 1);
    }
  }
  for (const [discordId, count] of discordCounts) {
    await supabase.from('discord_activity').update({ month_count: count }).eq('guild_id', guildId).eq('discord_id', discordId);
  }

  // In-game: count this month's messages per RSN from clan chat channel
  const { data: configs } = await supabase.from('guild_config').select('clanchat_channel_id').eq('guild_id', guildId).not('clanchat_channel_id', 'is', null);
  const ingameCounts = new Map();
  if (configs?.length) {
    const messages = await fetchMessagesAfter(configs[0].clanchat_channel_id, monthSnowflake);
    for (const msg of messages) {
      for (const embed of msg.embeds ?? []) {
        if (!embed.author?.name) continue;
        const rsn = embed.author.name.replace(/^\[Leagues\] /, '').replace(/ \([^)]+\)$/, '').trim().toLowerCase();
        if (rsn) ingameCounts.set(rsn, (ingameCounts.get(rsn) ?? 0) + 1);
      }
    }
    for (const [rsn, count] of ingameCounts) {
      await supabase.from('ingame_activity').update({ month_count: count }).eq('guild_id', guildId).eq('rsn', rsn);
    }
  }

  data.monthCountFilled = true;
  await saveData(guildId, data);
  console.log(`[activity] Month count backfill: ${discordCounts.size} Discord, ${ingameCounts.size} in-game`);
}

async function retroScanDiscordActivity() {
  const guildId = process.env.CLAN_GUILD_ID;
  if (!guildId) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const data = await loadData(guildId);
  if (data.discordRetroScanned) return;

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const afterSnowflake = dateToSnowflake(ninetyDaysAgo);
  let total = 0;

  for (const [, channel] of guild.channels.cache) {
    if (channel.type !== 0) continue;
    const messages = await fetchMessagesAfter(channel.id, afterSnowflake);
    for (const msg of messages) {
      if (msg.author?.bot || msg.webhookId) continue;
      const displayName = msg.member?.displayName ?? msg.author?.username ?? 'Unknown';
      await logDiscordMessage(guildId, msg.author.id, displayName);
      total++;
    }
  }

  data.discordRetroScanned = true;
  await saveData(guildId, data);
  console.log(`[activity] Retro Discord scan guild ${guildId}: ${total} messages`);
}

async function retroScanIngameActivity() {
  const { data: configs } = await supabase.from('guild_config')
    .select('guild_id, clanchat_channel_id')
    .not('clanchat_channel_id', 'is', null);

  for (const cfg of configs ?? []) {
    try {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const messages = await fetchMessagesAfter(cfg.clanchat_channel_id, dateToSnowflake(ninetyDaysAgo));
      let counted = 0;
      for (const msg of messages) {
        for (const embed of msg.embeds ?? []) {
          if (!embed.author?.name) continue;
          // Format: "[Leagues] RSN (Rank)" — extract RSN
          const rsn = embed.author.name.replace(/^\[Leagues\] /, '').replace(/ \([^)]+\)$/, '').trim();
          if (rsn) { await logIngameMessage(cfg.guild_id, rsn); counted++; }
        }
      }
      console.log(`[activity] Retro ingame scan guild ${cfg.guild_id}: ${counted} messages`);
    } catch (err) {
      console.error(`[activity] Retro scan failed for guild ${cfg.guild_id}: ${err.message}`);
    }
  }
}

async function syncWomGroup() {
  const groupId = process.env.WOM_GROUP_ID
  const verificationCode = process.env.WOM_VERIFICATION_CODE
  if (!groupId || !verificationCode) return
  try {
    const res = await fetch(`https://api.wiseoldman.net/v2/groups/${groupId}/update-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': process.env.WOM_USER_AGENT || 'clan-bot' },
      body: JSON.stringify({ verificationCode }),
    })
    if (res.ok) {
      console.log('[wom] Group sync triggered')
    } else {
      const body = await res.text().catch(() => '')
      const json = JSON.parse(body || '{}')
      if (json.code === 'NO_OUTDATED_MEMBERS') {
        console.log('[wom] Group sync skipped — all members up to date')
      } else {
        console.warn(`[wom] Group sync failed (${res.status}): ${body}`)
      }
    }
  } catch (err) {
    console.error(`[wom] Group sync error: ${err.message}`)
  }
}

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error(`[startup] Failed to log in: ${err.message}`);
  console.error('         Check that DISCORD_TOKEN in your .env is correct.');
  process.exit(1);
});
