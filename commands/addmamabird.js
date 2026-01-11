import { SlashCommandBuilder } from 'discord.js';
import { requireMamaBird } from '../utils/permissions.js';
import { extractDiscordId, createTextComponentMessage } from '../services/discord.js';
import { grantMamaBird as grant, checkMamaBird } from '../services/mamabirdService.js';

export const data = new SlashCommandBuilder()
  .setName('addmamabird')
  .setDescription('Grant Mama Bird permissions to a user')
  .addStringOption(option =>
    option
      .setName('user')
      .setDescription('Discord mention or ID of the user to grant')
      .setRequired(true)
  );

export async function execute(interaction) {
  if (!(await requireMamaBird(interaction))) return;

  const userInput = interaction.options.getString('user');
  const targetId = extractDiscordId(userInput);

  if (!targetId) {
    await interaction.reply(createTextComponentMessage('Please provide a valid Discord ID or mention.', { flags: 64 }));
    return;
  }

  if (checkMamaBird(targetId)) {
    await interaction.reply(createTextComponentMessage(`<@${targetId}> is already a Mama Bird.`, { flags: 64 }));
    return;
  }

  const result = grant(targetId);
  if (!result.ok) {
    await interaction.reply(
      createTextComponentMessage(`Failed to grant Mama Bird status: ${result.reason ?? 'unknown error'}.`, { flags: 64 })
    );
    return;
  }

  await interaction.reply(createTextComponentMessage(`Granted Mama Bird permissions to <@${targetId}>.`, { flags: 64 }));
}

export default { data, execute };
