const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { loadWelcome, saveWelcome } = require('../utils/welcomeStorage');

const TOS_EMBED = new EmbedBuilder()
  .setTitle('📜 Clan Rules')
  .setColor(0xe67e22)
  .setDescription('Read and agree to the following rules to gain full access to the clan.')
  .addFields(
    {
      name: '🤝 Be Respectful',
      value: "We're here to have fun, earn cash, and smash goals together. Disrespect has no place here — treat everyone as you'd want to be treated."
    },
    {
      name: '🚫 No Scamming',
      value: 'Zero tolerance. Scamming any member will result in a ban. Use collateral when lending items so both parties are protected.'
    },
    {
      name: '😤 No Drama',
      value: "Don't actively cause it. If conflict does arise, both sides will be heard and mods will work to resolve it quickly and fairly."
    },
    {
      name: '🙏 No Begging',
      value: 'Earn your coin through events and gameplay. If you need help, check the help channels or wait patiently — don\'t pressure people who are busy.'
    },
    {
      name: '🚷 No Racism or Extreme Views',
      value: 'Zero tolerance, full stop. Expect an immediate ban.'
    },
    {
      name: '🗳️ Politics',
      value: "Feel free to discuss, but keep it civil. Don't let it slide into extreme territory — everyone has different views, respect that."
    },
    {
      name: '🔄 Rejoining Policy',
      value: 'Leaving and coming back requires a mod discussion. No money changes hands — it\'s a fair review, nothing shady.'
    }
  )
  .setFooter({ text: 'Click the button below to confirm you have read and agree to these rules.' });

function buildTosButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('welcome_agree')
      .setLabel('✅ I Agree')
      .setStyle(ButtonStyle.Success)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Manage the welcome / rules panel')
    .addSubcommand(sub => sub
      .setName('post')
      .setDescription('Post the rules embed with agree button in this channel')
    )
    .addSubcommand(sub => sub
      .setName('setrole')
      .setDescription('Set the role granted when a member is approved')
      .addRoleOption(opt => opt.setName('role').setDescription('Role to grant').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('setmodchannel')
      .setDescription('Set the channel where mod approval requests are sent')
      .addChannelOption(opt => opt.setName('channel').setDescription('Mod review channel').setRequired(true))
    )
    .setDefaultMemberPermissions(0n),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const data = loadWelcome(guildId);

    if (sub === 'post') {
      if (data.channelId && data.messageId) {
        try {
          const oldChannel = await interaction.client.channels.fetch(data.channelId);
          const oldMessage = await oldChannel.messages.fetch(data.messageId);
          await oldMessage.delete();
        } catch {
          // Already gone
        }
      }

      const message = await interaction.channel.send({
        embeds: [TOS_EMBED],
        components: [buildTosButtons()]
      });

      data.channelId = interaction.channel.id;
      data.messageId = message.id;
      saveWelcome(guildId, data);
      await interaction.reply({ content: '✅ Rules panel posted!', flags: 64 });

    } else if (sub === 'setrole') {
      const role = interaction.options.getRole('role');
      data.roleId = role.id;
      saveWelcome(guildId, data);
      await interaction.reply({ content: `✅ Members will receive <@&${role.id}> when approved by a mod.`, flags: 64 });

    } else if (sub === 'setmodchannel') {
      const channel = interaction.options.getChannel('channel');
      data.modChannelId = channel.id;
      saveWelcome(guildId, data);
      await interaction.reply({ content: `✅ TOS approval requests will be sent to ${channel}.`, flags: 64 });
    }
  }
};
