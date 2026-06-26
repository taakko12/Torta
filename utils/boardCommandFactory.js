const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadData, saveData, getBoard } = require('./storage');
const { refreshLeaderboardMessage } = require('./updateLeaderboard');

function makeAddCommand(config) {
  return {
    data: new SlashCommandBuilder()
      .setName(config.commandName)
      .setDescription(`Add win(s) to a member's ${config.label} count`)
      .addUserOption(opt => opt.setName('user').setDescription('Member to award').setRequired(true))
      .addIntegerOption(opt =>
        opt.setName('amount').setDescription('Number of wins to add (default 1)').setMinValue(1)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
      const guildId = interaction.guildId;
      const user = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount') ?? 1;

      const data = loadData(guildId);
      const board = getBoard(data, config.boardKey);
      if (!board.users[user.id]) board.users[user.id] = { wins: 0 };
      board.users[user.id].wins += amount;
      saveData(guildId, data);

      await refreshLeaderboardMessage(interaction.client, board, {
        title: config.embedTitle,
        color: config.color
      });

      await interaction.reply({
        content: `✅ Added **${amount}** ${config.label} win${amount === 1 ? '' : 's'} to <@${user.id}>. They now have **${board.users[user.id].wins}** total.`,
        ephemeral: true
      });
    }
  };
}

function makeRemoveCommand(config) {
  return {
    data: new SlashCommandBuilder()
      .setName(config.commandName)
      .setDescription(`Remove win(s) from a member's ${config.label} count`)
      .addUserOption(opt => opt.setName('user').setDescription('Member to adjust').setRequired(true))
      .addIntegerOption(opt =>
        opt.setName('amount').setDescription('Number of wins to remove (default 1)').setMinValue(1)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
      const guildId = interaction.guildId;
      const user = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount') ?? 1;

      const data = loadData(guildId);
      const board = getBoard(data, config.boardKey);
      if (!board.users[user.id]) board.users[user.id] = { wins: 0 };
      board.users[user.id].wins = Math.max(0, board.users[user.id].wins - amount);
      saveData(guildId, data);

      await refreshLeaderboardMessage(interaction.client, board, {
        title: config.embedTitle,
        color: config.color
      });

      await interaction.reply({
        content: `✅ Removed **${amount}** ${config.label} win${amount === 1 ? '' : 's'} from <@${user.id}>. They now have **${board.users[user.id].wins}** total.`,
        ephemeral: true
      });
    }
  };
}

function makeSetCommand(config) {
  return {
    data: new SlashCommandBuilder()
      .setName(config.commandName)
      .setDescription(`Set a member's ${config.label} count directly`)
      .addUserOption(opt => opt.setName('user').setDescription('Member to set').setRequired(true))
      .addIntegerOption(opt =>
        opt.setName('amount').setDescription('Exact win count').setMinValue(0).setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
      const guildId = interaction.guildId;
      const user = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');

      const data = loadData(guildId);
      const board = getBoard(data, config.boardKey);
      if (!board.users[user.id]) board.users[user.id] = { wins: 0 };
      board.users[user.id].wins = amount;
      saveData(guildId, data);

      await refreshLeaderboardMessage(interaction.client, board, {
        title: config.embedTitle,
        color: config.color
      });

      await interaction.reply({
        content: `✅ Set <@${user.id}>'s ${config.label} wins to **${amount}**.`,
        ephemeral: true
      });
    }
  };
}

function makeCheckCommand(config) {
  return {
    data: new SlashCommandBuilder()
      .setName(config.commandName)
      .setDescription(`Check a member's ${config.label} win count`)
      .addUserOption(opt => opt.setName('user').setDescription('Member to check (defaults to you)')),

    async execute(interaction) {
      const user = interaction.options.getUser('user') ?? interaction.user;
      const data = loadData(interaction.guildId);
      const board = getBoard(data, config.boardKey);
      const wins = board.users[user.id]?.wins ?? 0;

      await interaction.reply(
        `${config.checkEmoji ?? '🏆'} <@${user.id}> has **${wins}** ${config.label} win${wins === 1 ? '' : 's'}.`
      );
    }
  };
}

function makeLeaderboardCommand(config) {
  return {
    data: new SlashCommandBuilder()
      .setName(config.commandName)
      .setDescription(`Post the live ${config.label} leaderboard in this channel (auto-updates from here on)`)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
      const guildId = interaction.guildId;
      const data = loadData(guildId);
      const board = getBoard(data, config.boardKey);
      const embed = buildEmbedFor(board, config);
      const message = await interaction.channel.send({ embeds: [embed] });

      board.leaderboardMessage = {
        channelId: interaction.channel.id,
        messageId: message.id
      };
      saveData(guildId, data);

      await interaction.reply({
        content: `📌 ${config.label} leaderboard posted! It will auto-update whenever wins change.`,
        ephemeral: true
      });
    }
  };
}

function buildEmbedFor(board, config) {
  const { buildLeaderboardEmbed } = require('./leaderboardEmbed');
  return buildLeaderboardEmbed(board, { title: config.embedTitle, color: config.color });
}

module.exports = {
  makeAddCommand,
  makeRemoveCommand,
  makeSetCommand,
  makeCheckCommand,
  makeLeaderboardCommand
};
