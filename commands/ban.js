import { SlashCommandBuilder } from 'discord.js';
import { requireMamaBird } from '../utils/permissions.js';
import { createTextComponentMessage } from '../services/discord.js';

function extractDiscordId(value) {
  if (!value) return null;
  const match = new RegExp(/\d{17,20}/).exec(String(value));
  return match ? match[0] : null;
}

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Record a ban reason')
  .addStringOption(option =>
    option
      .setName('user')
      .setDescription('Discord mention or ID of the user')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('reason')
      .setDescription('Reason for the ban')
      .setRequired(true)
  );

export async function execute(interaction) {
  if (!(await requireMamaBird(interaction))) return;

  const userInput = interaction.options.getString('user');
  const reasonInput = interaction.options.getString('reason');

  const targetId = extractDiscordId(userInput);
  const reason = typeof reasonInput === 'string' ? reasonInput.trim() : '';

  if (!targetId) {
    await interaction.reply(createTextComponentMessage('Please provide a valid Discord ID or mention.', { flags: 64 }));
    return;
  }

  if (!reason) {
    await interaction.reply(createTextComponentMessage('Please provide a non-empty reason.', { flags: 64 }));
    return;
  }

  await interaction.reply(createTextComponentMessage(`banned <@${targetId}> with reason: ${reason}`));
}

export default { data, execute };
