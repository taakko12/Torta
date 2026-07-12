const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { EmbedBuilder } = require('discord.js');
const { findGuildByCode } = require('./trackscapeStorage');
const { extractBroadcast, stripTags } = require('./broadcastExtractor');
const { recordDrop } = require('./dropStorage');
const { recordDeath } = require('./plankStorage');
const { recordDeposit, updateLeaderboardEmbed } = require('./cofferStorage');
const { logIngameMessage } = require('./activityStorage');

// verificationCode → Set<WebSocket>
const rooms = new Map();

// 10-second dedup window to prevent double-posting when multiple plugin clients
// are online and all submit the same broadcast at the same time
const seen = new Map();
function isDuplicate(key) {
  const now = Date.now();
  if (seen.has(key) && now - seen.get(key) < 10_000) return true;
  seen.set(key, now);
  if (seen.size > 2000) {
    for (const [k, t] of seen) {
      if (now - t > 10_000) seen.delete(k);
    }
  }
  return false;
}

function buildBroadcastEmbed(broadcast) {
  const e = new EmbedBuilder().setTimestamp();
  switch (broadcast.type) {
    case 'RaidDrop':
      return e.setTitle('🏆 Raid Drop')
        .setDescription(`**${broadcast.player}** received **${broadcast.item}**${broadcast.value ? ` (${broadcast.value.toLocaleString()} coins)` : ''} from a raid!`)
        .setColor(0xFFD700);
    case 'ItemDrop':
      return e.setTitle('💰 Drop')
        .setDescription(`**${broadcast.player}** received a drop: ${broadcast.quantity > 1 ? `${broadcast.quantity}x ` : ''}**${broadcast.item}**${broadcast.value ? ` (${broadcast.value.toLocaleString()} coins)` : ''}`)
        .setColor(0xFFD700);
    case 'ClueItem':
      return e.setTitle('📜 Clue Item')
        .setDescription(`**${broadcast.player}** received a clue item: **${broadcast.item}**${broadcast.value ? ` (${broadcast.value.toLocaleString()} coins)` : ''}`)
        .setColor(0xF39C12);
    case 'PetDrop':
      return e.setTitle('🐾 Pet Drop')
        .setDescription(`**${broadcast.player}** got a pet: **${broadcast.pet}** at ${broadcast.count} ${broadcast.countType}!`)
        .setColor(0x9B59B6);
    case 'Quest':
      return e.setTitle('📖 Quest Complete')
        .setDescription(`**${broadcast.player}** completed **${broadcast.quest}**!`)
        .setColor(0xF1C40F);
    case 'Diary':
      return e.setTitle('📋 Diary Complete')
        .setDescription(`**${broadcast.player}** completed the **${broadcast.tier} ${broadcast.diary}**!`)
        .setColor(0x2ECC71);
    case 'LevelMilestone':
      return e.setTitle('⬆️ Level Up')
        .setDescription(`**${broadcast.player}** reached **${broadcast.skill}** level **${broadcast.level}**!`)
        .setColor(0x3498DB);
    case 'XPMilestone':
      return e.setTitle('✨ XP Milestone')
        .setDescription(`**${broadcast.player}** reached **${broadcast.xp}** XP in **${broadcast.skill}**!`)
        .setColor(0x3498DB);
    case 'CollectionLog':
      return e.setTitle('📦 Collection Log')
        .setDescription(`**${broadcast.player}** received a new collection log item: **${broadcast.item}** (${broadcast.slots} slots filled)`)
        .setColor(0xE67E22);
    case 'PersonalBest':
      return e.setTitle('⏱️ Personal Best')
        .setDescription(`**${broadcast.player}** set a new PB at **${broadcast.activity}**: **${broadcast.time}**!`)
        .setColor(0x1ABC9C);
    case 'PK':
      return e.setTitle(broadcast.won ? '⚔️ PK Kill' : '💀 PKed')
        .setDescription(broadcast.won
          ? `**${broadcast.player}** defeated **${broadcast.opponent}**${broadcast.gp ? ` and received ${broadcast.gp.toLocaleString()} coins` : ''}!`
          : `**${broadcast.player}** was defeated by **${broadcast.opponent}**${broadcast.gp ? ` and lost ${broadcast.gp.toLocaleString()} coins` : ''}!`)
        .setColor(0xE74C3C);
    case 'Invite':
      return e.setTitle('👋 New Member')
        .setDescription(`**${broadcast.player}** was invited to the clan by **${broadcast.invitedBy}**.`)
        .setColor(0x95A5A6);
    case 'LeftClan':
      return e.setTitle('🚪 Member Left')
        .setDescription(`**${broadcast.player}** has left the clan.`)
        .setColor(0x95A5A6);
    case 'Expelled':
      return e.setTitle('🔨 Member Expelled')
        .setDescription(`**${broadcast.player}** was expelled from the clan by **${broadcast.mod}**.`)
        .setColor(0x95A5A6);
    case 'Coffer':
      return e.setTitle('🏦 Coffer')
        .setDescription(`**${broadcast.player}** ${broadcast.action} **${broadcast.gp?.toLocaleString() ?? '?'} coins** ${broadcast.action === 'deposited' ? 'into' : 'from'} the coffer.`)
        .setColor(0xF39C12);
    default:
      return null;
  }
}

const supabase = require('./supabase');

const FEEDBACK_COLORS = { Events: 0x5865F2, Discord: 0x57F287, Bot: 0xFEE75C, Website: 0xEB459E };

function startTrackscapeServer(discordClient, port = 3000, { onWomCheck } = {}) {
  const app = express();
  app.use(express.json());

  app.post('/api/admin/wom-check', async (req, res) => {
    const secret = process.env.BOT_ADMIN_SECRET;
    if (!secret || req.headers['x-admin-secret'] !== secret) return res.status(401).send('Unauthorized');
    res.send('OK');
    if (onWomCheck) onWomCheck().catch(e => console.error(`[wom-check] ${e.message}`));
  });

  app.post('/api/loot-review-notify', async (req, res) => {
    const secret = process.env.BOT_ADMIN_SECRET;
    if (!secret || req.headers['x-admin-secret'] !== secret) return res.status(401).send('Unauthorized');
    const { guildId, type, label, reason, requestedBy, discordUrl } = req.body;
    res.send('OK');
    try {
      const { data: config } = await supabase
        .from('guild_config').select('inactivity_channel_id').eq('guild_id', guildId).single();
      const channelId = config?.inactivity_channel_id;
      if (!channelId) return;
      const channel = await discordClient.channels.fetch(channelId);
      if (!channel) return;
      const fields = [
        { name: 'Entry', value: label, inline: true },
        { name: 'Type', value: type === 'drop' ? 'Confirmed Drop' : 'Submission', inline: true },
        { name: 'Reason', value: reason },
      ];
      if (discordUrl) fields.push({ name: 'Jump to Drop', value: discordUrl });
      const embed = new EmbedBuilder()
        .setTitle('🚩 Loot Review Requested')
        .setColor(0xFEE75C)
        .addFields(fields)
        .setFooter({ text: `Requested by ${requestedBy}` })
        .setTimestamp();
      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error(`[loot-review-notify] ${err.message}`);
    }
  });

  app.post('/api/feedback-notify', async (req, res) => {
    const secret = process.env.BOT_ADMIN_SECRET;
    if (!secret || req.headers['x-admin-secret'] !== secret) return res.status(401).send('Unauthorized');
    const { guildId, category, message } = req.body;
    res.send('OK');
    try {
      const { data: config } = await supabase
        .from('guild_config').select('inactivity_channel_id').eq('guild_id', guildId).single();
      const channelId = config?.inactivity_channel_id;
      if (!channelId) return;
      const channel = await discordClient.channels.fetch(channelId);
      if (!channel) return;
      const embed = new EmbedBuilder()
        .setTitle('📬 New Feedback')
        .setColor(FEEDBACK_COLORS[category] ?? 0x7c5ce8)
        .addFields(
          { name: 'Category', value: category, inline: true },
          { name: 'Message', value: message },
        )
        .setFooter({ text: 'View all → https://tortapounders.vercel.app/admin/feedback' })
        .setTimestamp();
      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error(`[feedback-notify] ${err.message}`);
    }
  });

  app.post('/api/chat/new-clan-chat', async (req, res) => {
    const code = req.headers['verification-code'];
    if (!code) return res.status(400).send('No verification code');

    const guild = await findGuildByCode(code);
    if (!guild) return res.status(400).send('Unknown verification code');

    const messages = Array.isArray(req.body) ? req.body : [];

    for (const msg of messages) {
      const { sender, message, clan_name, rank } = msg;
      if (!sender && !clan_name) continue;

      const cleanMsg = stripTags(message ?? '');
      const dedupeKey = `${code}:${sender}:${cleanMsg}`;
      if (isDuplicate(dedupeKey)) continue;

      // Broadcasts have sender === clan_name
      const isBroadcast = sender === clan_name;
      const isLeague = msg.icon_id === 22;

      if (isBroadcast) {
        const broadcast = extractBroadcast(cleanMsg);
        if (!broadcast) continue;
        const embed = buildBroadcastEmbed(broadcast);
        if (!embed) continue;
        if (isLeague) embed.setFooter({ text: 'Leagues' });
        // Route coffer to its own channel if configured, else fall back to broadcast channel
        const targetChannelId = broadcast.type === 'Coffer' && guild.cofferChannelId
          ? guild.cofferChannelId
          : guild.broadcastChannelId;
        if (!targetChannelId) continue;
        try {
          const channel = await discordClient.channels.fetch(targetChannelId);
          if (channel) {
            const sentMsg = await channel.send({ embeds: [embed] });
            if ((broadcast.type === 'RaidDrop' || broadcast.type === 'ItemDrop') && broadcast.value > 0) {
              await recordDrop(guild.guildId, broadcast.player, broadcast.value, broadcast.item, null, null, sentMsg.id, 0);
            }
            if (broadcast.type === 'PK' && !broadcast.won) {
              await recordDeath(guild.guildId, broadcast.player, sentMsg.id, null);
            }
            if (broadcast.type === 'Coffer' && broadcast.gp > 0) {
              await recordDeposit(guild.guildId, broadcast.player, broadcast.gp, broadcast.action);
              updateLeaderboardEmbed(discordClient, guild.guildId).catch(() => {});
            }
          }
        } catch (err) {
          console.error(`[trackscape] Broadcast send failed for guild ${guild.guildId}: ${err.message}`);
        }
      } else {
        if (!guild.clanChatChannelId) continue;
        logIngameMessage(guild.guildId, sender).catch(() => {});
        const embed = new EmbedBuilder()
          .setAuthor({ name: `${isLeague ? '[Leagues] ' : ''}${sender} (${rank || 'Member'})` })
          .setDescription(cleanMsg)
          .setColor(0x0055AA)
          .setTimestamp();
        try {
          const channel = await discordClient.channels.fetch(guild.clanChatChannelId);
          if (channel) await channel.send({ embeds: [embed] });
        } catch (err) {
          console.error(`[trackscape] Clan chat send failed for guild ${guild.guildId}: ${err.message}`);
        }
      }
    }

    res.send('OK');
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/api/chat/ws' });

  wss.on('connection', async (ws, req) => {
    const code = req.headers['verification-code'];
    if (!code || !(await findGuildByCode(code))) {
      ws.close(1008, 'Invalid verification code');
      return;
    }
    if (!rooms.has(code)) rooms.set(code, new Set());
    rooms.get(code).add(ws);
    ws.on('close', () => rooms.get(code)?.delete(ws));
  });

  server.listen(port, () => {
    console.log(`[trackscape] Listening on port ${port}`);
  });

  return server;
}

// Relay a Discord message back into in-game clan chat
function sendToGame(code, sender, message) {
  const room = rooms.get(code);
  if (!room) return;
  const payload = JSON.stringify({ message_type: 'ToClanChat', message: { sender, message } });
  for (const ws of room) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

module.exports = { startTrackscapeServer, sendToGame };
