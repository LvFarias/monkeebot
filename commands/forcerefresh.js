import { SlashCommandBuilder } from 'discord.js';
import { requireMamaBird } from '../utils/permissions.js';
import { refreshContracts } from '../services/contractService.js';
import { createTextComponentMessage } from '../services/discord.js';

export const data = new SlashCommandBuilder()
  .setName('forcerefresh')
  .setDescription('Force the contract refresh right now.');

export async function execute(interaction) {
  if (!(await requireMamaBird(interaction))) return;

  await interaction.deferReply({ flags: 64 });

  try {
    const contracts = await refreshContracts();
    const count = Array.isArray(contracts) ? contracts.length : 0;
    const epoch = Math.floor(Date.now() / 1000);

    await interaction.editReply(
      createTextComponentMessage(`Contracts refreshed. Loaded ${count} contracts as of <t:${epoch}:f>.`, { flags: 64 })
    );
  } catch (err) {
    const message = err?.message ?? String(err);
    await interaction.editReply(
      createTextComponentMessage(`Failed to refresh contracts: ${message}`, { flags: 64 })
    );
  }
}
