const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { EmbedBuilder } = require('discord.js');
const { findGuildByCode } = require('./trackscapeStorage');
const { extractBroadcast, stripTags } = require('./broadcastExtractor');
const { recordDrop } = require('./dropStorage');

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

function startTrackscapeServer(discordClient, port = 3000) {
  const app = express();
  app.use(express.json());

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
        if (!guild.broadcastChannelId) continue;
        const broadcast = extractBroadcast(cleanMsg);
        if (!broadcast) continue;
        const embed = buildBroadcastEmbed(broadcast);
        if (!embed) continue;
        if (isLeague) embed.setFooter({ text: 'Leagues' });
        try {
          const channel = await discordClient.channels.fetch(guild.broadcastChannelId);
          if (channel) {
            const sentMsg = await channel.send({ embeds: [embed] });
            if ((broadcast.type === 'RaidDrop' || broadcast.type === 'ItemDrop') && broadcast.value > 0) {
              await recordDrop(guild.guildId, broadcast.player, broadcast.value, broadcast.item, null, null, sentMsg.id, 0);
            }
          }
        } catch (err) {
          console.error(`[trackscape] Broadcast send failed for guild ${guild.guildId}: ${err.message}`);
        }
      } else {
        if (!guild.clanChatChannelId) continue;
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
