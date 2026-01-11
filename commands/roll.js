import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { createTextComponentMessage } from '../services/discord.js';

export const data = new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll a set of dice.')
    .addIntegerOption(option =>
      option.setName('eyes')
        .setDescription('Number of sides on the dice')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Number of dice to roll')
        .setRequired(true)
    );

  export async function execute(interaction) {
    const eyes = interaction.options.getInteger('eyes');
    let amount = interaction.options.getInteger('amount');
    let total = 0;

    if (eyes < 2 || amount < 1) {
      return interaction.reply(
        createTextComponentMessage('Please use at least a 2-sided die and roll at least 1 die.', { flags: 64 })
      );
    }

    // Cap the amount at 25
    if (amount > 25) {
      amount = 25;
    }

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const logic = () => {
      total = 0;
      const embed = new EmbedBuilder()
        .setTitle('__**Results**__')
        .setColor(0x6a0dad);

      for (let i = 1; i <= amount; i++) {
        const roll = Math.floor(Math.random() * eyes) + 1;
        total += roll;
        embed.addFields({ name: `Dice ${i}`, value: `Rolled: ${roll}`, inline: true });
      }

      const footer = amount === 1
        ? `You rolled ${amount} die with ${eyes} sides. Total: ${total}, Average: ${(total / amount).toFixed(2)}`
        : `You rolled ${amount} dice with ${eyes} sides. Total: ${total}, Average: ${(total / amount).toFixed(2)}`;

      embed.setFooter({ text: footer });
      return embed;
    };

    // Initial reply
    await interaction.reply({ embeds: [logic()] });

    // Animated rolling
    for (let i = 0; i < 14; i++) {
      await sleep(500);
      await interaction.editReply({ embeds: [logic()] });
    }
  }