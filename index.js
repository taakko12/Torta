require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { loadRaids, updateRaid } = require('./utils/raidStorage');
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
const { isLootEmbed, dateToSnowflake, parseBroadcastDropEmbed } = require('./utils/messageHelper');
const { loadAnnounce, clearAnnounce } = require('./utils/announceStorage');

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
    GatewayIntentBits.MessageContent
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
    for (const [guildId] of client.guilds.cache) {
      const ann = loadAnnounce(guildId);
      if (!ann || Date.now() < ann.scheduledAt) continue;
      try {
        const ch = await client.channels.fetch(ann.channelId);
        const mentionContent = [
          ann.content.includes('@everyone') ? '@everyone' : null,
          ann.content.includes('@here') ? '@here' : null,
        ].filter(Boolean).join(' ') || undefined;
        await ch.send({
          content: mentionContent,
          embeds: [new EmbedBuilder().setDescription(ann.content)],
          allowedMentions: { parse: ['everyone'] },
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
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

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
      const panel = loadPanel(interaction.guildId);
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
      const welcome = loadWelcome(guildId);

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
      const welcome = loadWelcome(guildId);
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

      const data = loadRaids(guildId);
      const raid = data.raids[raidId];
      if (!raid) {
        return interaction.reply({ content: '❌ This raid no longer exists.', flags: 64 });
      }
      if (raid.attendees) {
        return interaction.reply({ content: '❌ This raid is already marked complete.', flags: 64 });
      }

      updateRaid(guildId, data, raidId, { attendees: raid.signups });
      const updatedRaid = data.raids[raidId];
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
      const lootData = loadLoot(guildId);
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

    if (action !== 'raid_signup' && action !== 'raid_dropout') return;
    const raidId = payload;
    const guildId = interaction.guildId;

    const data = loadRaids(guildId);
    const raid = data.raids[raidId];
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

    updateRaid(guildId, data, raidId, { signups: raid.signups });

    await interaction.update({
      embeds: [buildRaidEmbed(raid)],
      components: buildRaidButtons(raidId)
    }).catch(err => console.error(`[button] Failed to update raid embed: ${err.message}`));
  }
});

// Watch configured channels for Dink death and loot webhook messages
client.on('messageCreate', async message => {
  if (!message.guildId) return;

  const guildId = message.guildId;

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
        const parsed = parseBroadcastDropEmbed(message.embeds[i]);
        if (!parsed || !(parsed.value > 0)) continue;
        await recordDrop(guildId, parsed.player, parsed.value, parsed.item, null, null, message.id, i);
        console.log(`[broadcast] Recorded ${parsed.value.toLocaleString()} gp (${parsed.item}) for "${parsed.player}" in guild ${guildId}`);
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
      const quip = DEATH_QUIPS[Math.floor(Math.random() * DEATH_QUIPS.length)];
      message.channel.send(`**${playerName}** — ${quip}`).catch(() => {});
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
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) return;

  const now = Math.floor(Date.now() / 1000);

  for (const guildId of fs.readdirSync(dataDir)) {
    const dirPath = path.join(dataDir, guildId);
    if (!fs.statSync(dirPath).isDirectory()) continue;

    const data = loadRaids(guildId);
    for (const [raidId, raid] of Object.entries(data.raids)) {
      if (raid.timestamp <= now) continue;

      const secondsUntil = raid.timestamp - now;
      const in24h = secondsUntil <= 86400 && secondsUntil > 86100;
      const in1h  = secondsUntil <= 3600  && secondsUntil > 3300;

      if (in24h && !raid.reminded24h) {
        console.log(`[reminders] Sending 24h reminder for raid "${raid.name}" in guild ${guildId}`);
        await sendReminder(raid, '24 hours');
        updateRaid(guildId, data, raidId, { reminded24h: true });
      } else if (in1h && !raid.reminded1h) {
        console.log(`[reminders] Sending 1h reminder for raid "${raid.name}" in guild ${guildId}`);
        await sendReminder(raid, '1 hour');
        updateRaid(guildId, data, raidId, { reminded1h: true });
      }
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


client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error(`[startup] Failed to log in: ${err.message}`);
  console.error('         Check that DISCORD_TOKEN in your .env is correct.');
  process.exit(1);
});
