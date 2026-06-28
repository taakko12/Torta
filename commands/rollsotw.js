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
const REROLL_THRESHOLD = 5;

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

  const startsAt = ctToUtc(y1, m1, d1, 13, 0);
  const endsAt   = ctToUtc(y2, m2, d2, 12, 0);
  return { startsAt, endsAt };
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

function buildButtons(votes = 0) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sotw_accept').setLabel('✅ Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('sotw_reroll')
      .setLabel(votes > 0 ? `🔄 Reroll (${votes}/${REROLL_THRESHOLD})` : '🔄 Reroll')
      .setStyle(ButtonStyle.Secondary),
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rollsotw')
    .setDescription('Randomly select a Skill of the Week — Mon 1pm CT to next Mon 12pm CT')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const data = loadData(guildId);

    const history = data.sotwHistory ?? [];
    const recentSet = new Set(history.slice(-HISTORY_SIZE));
    const sessionRejected = new Set();
    const rerollVoters = new Set();

    const { startsAt, endsAt } = nextSotwWindow();
    const windowStr = `${formatCt(startsAt)} → ${formatCt(endsAt)}`;

    const buildPool = () => SOTW_SKILLS.filter(s => !recentSet.has(s) && !sessionRejected.has(s));

    let pool = buildPool();
    if (pool.length === 0) {
      data.sotwHistory = [];
      pool = [...SOTW_SKILLS];
    }

    let rolled = pool[Math.floor(Math.random() * pool.length)];
    const recentNames = history.slice(-HISTORY_SIZE).map(s => DISPLAY[s] ?? s);

    const buildEmbed = (skill, votes = 0) => new EmbedBuilder()
      .setTitle('📈 Skill of the Week')
      .setColor(0x57f287)
      .setDescription(`## ${DISPLAY[skill] ?? skill}`)
      .addFields(
        { name: 'Competition window', value: windowStr },
        { name: 'Recent picks (excluded)', value: recentNames.length > 0 ? recentNames.join(', ') : 'None yet' },
      )
      .setFooter({ text: `Mods: Accept to lock in | Anyone: ${REROLL_THRESHOLD} votes to reroll • Times out in 5 min` })
      .setTimestamp();

    function doReroll() {
      sessionRejected.add(rolled);
      let next = buildPool();
      if (next.length === 0) {
        sessionRejected.clear();
        next = buildPool();
      }
      rolled = next[Math.floor(Math.random() * next.length)];
      rerollVoters.clear();
    }

    const response = await interaction.reply({
      embeds: [buildEmbed(rolled)],
      components: [buildButtons()],
      fetchReply: true,
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 5 * 60 * 1000,
    });

    collector.on('collect', async i => {
      if (i.customId === 'sotw_accept') {
        if (!i.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          await i.reply({ content: '❌ Only moderators can accept the roll.', ephemeral: true });
          return;
        }

        data.sotwHistory = [...history, rolled].slice(-HISTORY_SIZE * 2);
        saveData(guildId, data);

        const title = `Skill of the Week — ${DISPLAY[rolled] ?? rolled}`;
        const finalEmbed = new EmbedBuilder()
          .setTitle('📈 Skill of the Week — Locked In')
          .setColor(0x57f287)
          .setDescription(`## ${DISPLAY[rolled] ?? rolled}`)
          .addFields(
            { name: 'Competition window', value: windowStr },
            { name: 'Recent picks (excluded)', value: recentNames.length > 0 ? recentNames.join(', ') : 'None yet' },
          )
          .setTimestamp();

        const comp = await createWomCompetition(rolled, startsAt, endsAt, title);
        if (comp?.id) {
          finalEmbed.addFields({
            name: '🏆 WOM Competition',
            value: `[${title}](https://wiseoldman.net/competitions/${comp.id})`,
          });
        } else if (process.env.WOM_GROUP_VERIFICATION_CODE) {
          finalEmbed.addFields({ name: '⚠️ WOM', value: 'Competition creation failed — check WOM API.' });
        } else {
          finalEmbed.addFields({ name: 'ℹ️ WOM', value: 'Add `WOM_GROUP_VERIFICATION_CODE` to Railway env to auto-create competitions.' });
        }

        await i.update({ embeds: [finalEmbed], components: [] });
        collector.stop('accepted');

      } else if (i.customId === 'sotw_reroll') {
        if (i.user.id === interaction.user.id) {
          doReroll();
          await i.update({ embeds: [buildEmbed(rolled)], components: [buildButtons()] });
          return;
        }

        if (rerollVoters.has(i.user.id)) {
          await i.reply({ content: '⚠️ You already voted to reroll.', ephemeral: true });
          return;
        }

        rerollVoters.add(i.user.id);

        if (rerollVoters.size >= REROLL_THRESHOLD) {
          doReroll();
          await i.update({ embeds: [buildEmbed(rolled)], components: [buildButtons()] });
        } else {
          await i.update({ embeds: [buildEmbed(rolled)], components: [buildButtons(rerollVoters.size)] });
        }
      }
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'accepted') {
        interaction.editReply({ components: [] }).catch(() => {});
      }
    });
  },
};
