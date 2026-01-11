// /commands/monkee.js
import { SlashCommandBuilder } from 'discord.js';
import { createTextComponentMessage } from '../services/discord.js';

let monkeeEnabled = false;

export const data = new SlashCommandBuilder()
  .setName('monkee')
  .setDescription('Toggle Monkee AI bot')
  .addSubcommand(sub =>
    sub.setName('on').setDescription('Enable Monkee AI'))
  .addSubcommand(sub =>
    sub.setName('off').setDescription('Disable Monkee AI'));

export async function execute(interaction) {
    if (interaction.user.id !== '659339631564947456') {
      return await interaction.reply(
        createTextComponentMessage('🚫 You are not authorized to perform this action.', { flags: 64 })
      );
    }
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'on') {
    monkeeEnabled = true;
    await interaction.reply(createTextComponentMessage('🧠 Monkee bot is now **enabled**.'));
  } else if (subcommand === 'off') {
    monkeeEnabled = false;
    await interaction.reply(createTextComponentMessage('🙈 Monkee bot is now **disabled**.'));
  }
}

export function isMonkeeEnabled() {
  return monkeeEnabled;
}
