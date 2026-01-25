import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import {
  chunkContent,
  createDiscordProgressReporter,
  createTextComponentMessage,
} from '../services/discord.js';
import { fetchContractSummaries } from '../services/contractService.js';
import { findContractMatch } from '../utils/predictmaxcs/contracts.js';
import { buildPlayerTableLines, formatEggs, secondsToHuman } from '../utils/predictmaxcs/display.js';
import { buildModel, getAssumptions, TOKEN_CANDIDATES } from '../utils/predictmaxcs/model.js';

export const data = new SlashCommandBuilder()
  .setName('predictmaxcs')
  .setDescription('Predict max CS with best-gear assumptions and token pacing.')
  .addStringOption(option =>
    option
      .setName('contract')
      .setDescription('Contract id or name (autofills missing values)')
      .setAutocomplete(true)
      .setRequired(true)
  )
  .addNumberOption(option =>
    option
      .setName('token_speed')
      .setDescription('Token gift speed per player (minutes)')
      .setRequired(true)
  )
  .addNumberOption(option =>
    option
      .setName('avg_te')
      .setDescription('Average TE (0-490). Default: 100')
      .setMinValue(0)
      .setMaxValue(490)
      .setRequired(false)
  )
  .addBooleanOption(option =>
    option
      .setName('gg')
      .setDescription('Double tokens per gift (GG)')
      .setRequired(false)
  )
  .addBooleanOption(option =>
    option
      .setName('siab')
      .setDescription('Force SIAB on/off (default: auto)')
      .setRequired(false)
  );

export async function execute(interaction) {
  const contractInput = interaction.options.getString('contract');
  const tokenSpeedInput = interaction.options.getNumber('token_speed');
  const avgTeInput = interaction.options.getNumber('avg_te');
  const gg = interaction.options.getBoolean('gg') ?? false;
  const siabOverride = interaction.options.getBoolean('siab');

  let contractMatch = null;
  const contracts = await fetchContractSummaries();
  contractMatch = findContractMatch(contracts, contractInput);
  if (!contractMatch) {
    return interaction.reply(createTextComponentMessage('Unknown contract. Use a valid contract id or name.', { flags: 64 }));
  }

  const players = Number.isFinite(contractMatch?.maxCoopSize) ? contractMatch.maxCoopSize : null;
  const durationSeconds = Number.isFinite(contractMatch?.coopDurationSeconds) ? contractMatch.coopDurationSeconds : null;
  const targetEggs = Number.isFinite(contractMatch?.eggGoal) ? contractMatch.eggGoal : null;
  const tokenTimerMinutes = Number.isFinite(contractMatch?.minutesPerToken) ? contractMatch.minutesPerToken : null;

  const giftMinutes = tokenSpeedInput;

  const missingFields = [];
  if (!Number.isFinite(players) || players <= 0) missingFields.push('players');
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) missingFields.push('duration');
  if (!Number.isFinite(targetEggs) || targetEggs <= 0) missingFields.push('target');
  if (!Number.isFinite(tokenTimerMinutes) || tokenTimerMinutes <= 0) missingFields.push('token_timer');

  if (missingFields.length > 0) {
    return interaction.reply(createTextComponentMessage(
      `Missing or invalid contract data: ${missingFields.join(', ')}. Choose a contract with those fields.`,
      { flags: 64 },
    ));
  }

  if (!Number.isFinite(giftMinutes) || giftMinutes <= 0) {
    return interaction.reply(createTextComponentMessage('Invalid token speed input.', { flags: 64 }));
  }

  const avgTe = Number.isFinite(avgTeInput) ? avgTeInput : 100;
  if (!Number.isFinite(avgTe) || avgTe < 0 || avgTe > 490) {
    return interaction.reply(createTextComponentMessage('Average TE must be between 0 and 490.', { flags: 64 }));
  }

  await interaction.deferReply();

  const totalSteps = 2 * (1 + players * TOKEN_CANDIDATES.length * 2);
  const progressReporter = createDiscordProgressReporter(interaction, {
    prefix: 'PredictMaxCS',
    width: 20,
    intervalMs: 1200,
  });

  const progress = {
    total: totalSteps,
    completed: 0,
    async update({ completed, active, queued } = {}) {
      if (Number.isFinite(completed)) {
        this.completed = Math.min(this.total, completed);
      }
      const activeCount = Number.isFinite(active) ? active : 0;
      const queuedCount = Math.max(0, this.total - this.completed - activeCount);
      await progressReporter({
        completed: this.completed,
        total: this.total,
        active: activeCount,
        queued: queuedCount,
      });
    },
  };

  await progress.update({ completed: 0, active: 0, queued: totalSteps });

  const assumptions = getAssumptions(avgTe);
  const model = await buildModel({
    players,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    assumptions,
    siabOverride,
    modifierType: contractMatch?.modifierType ?? null,
    modifierValue: contractMatch?.modifierValue ?? null,
    progress,
  });
  const contractLabel = contractMatch?.name || contractMatch?.id || contractInput;
  const outputLines = buildPlayerTableLines(model, assumptions);
  outputLines.unshift(`Players: ${players} | Duration: ${secondsToHuman(durationSeconds)} | Target: ${formatEggs(targetEggs)}`);

  const chunks = chunkContent(outputLines, { maxLength: 3800, separator: '\n' });
  const embeds = chunks.map((chunk, index) => new EmbedBuilder()
    .setTitle(index === 0
      ? `PredictMaxCS (${contractLabel})`
      : 'PredictMaxCS (cont.)')
    .setDescription(chunk));

  const [first, ...rest] = embeds;
  await interaction.editReply({ content: '', embeds: [first] });
  for (const embed of rest) {
    await interaction.followUp({ embeds: [embed] });
  }
}

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused()?.toLowerCase?.() ?? '';
  const contracts = await fetchContractSummaries();
  const filtered = contracts
    .filter(contract =>
      String(contract.id || '').toLowerCase().includes(focused)
      || String(contract.name || '').toLowerCase().includes(focused)
    )
    .slice(0, 25)
    .map(contract => ({
      name: contract.name ? `${contract.name} (${contract.id})` : contract.id,
      value: contract.id,
    }));

  await interaction.respond(filtered);
}