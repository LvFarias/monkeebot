import { SlashCommandBuilder } from 'discord.js';
import { fetchActiveContracts, fetchContractSummaries } from '../services/contractService.js';
import { findFreeCoopCodes } from '../services/coopService.js';
import { chunkContent, createTextComponentMessage } from '../services/discord.js';

const CODE_OPTION_DEFAULT = 'default';
const CODE_OPTION_EXTENDED = 'extended';
const CODE_OPTION_EXTENDED_PLUS = 'extended_plus';
const CONTRACT_OPTION = 'contract';

function buildCoopCodes(mode = CODE_OPTION_DEFAULT) {
  const letters = Array.from({ length: 26 }, (_, index) => String.fromCharCode(97 + index));
  const digits = Array.from({ length: 10 }, (_, index) => String(index));

  const normalizedMode = [CODE_OPTION_EXTENDED, CODE_OPTION_EXTENDED_PLUS].includes(mode)
    ? mode
    : CODE_OPTION_DEFAULT;

  const prefixes = normalizedMode === CODE_OPTION_DEFAULT ? letters : [...letters, ...digits];
  const suffixes = normalizedMode === CODE_OPTION_EXTENDED_PLUS ? ['oo', 'ooo'] : ['oo'];

  return prefixes.flatMap(prefix => suffixes.map(suffix => `${prefix}${suffix}`));
}

export const data = new SlashCommandBuilder()
  .setName('freecoops')
  .setDescription('Check for free coops in recent contracts')
  .addStringOption(option =>
    option
      .setName(CONTRACT_OPTION)
      .setDescription('Which contract to check (type to search or choose a preset)')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addBooleanOption(option =>
    option
      .setName('copy')
      .setDescription('Wrap the output in a code block for easier copying')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('codes')
      .setDescription('Which coop codes to check')
      .setRequired(false)
      .addChoices(
        { name: 'default', value: CODE_OPTION_DEFAULT },
        { name: 'extended', value: CODE_OPTION_EXTENDED },
        { name: 'extended+', value: CODE_OPTION_EXTENDED_PLUS },
      )
  )
  
export async function execute(interaction) {
  const copyOutput = interaction.options.getBoolean('copy') ?? false;
  const codesOption = interaction.options.getString('codes') ?? CODE_OPTION_DEFAULT;
  const contractInput = (interaction.options.getString(CONTRACT_OPTION) ?? '').trim();

  if (!contractInput) {
    await interaction.reply(createTextComponentMessage('Please choose a contract to check.', { flags: 64 }));
    return;
  }

  const coopCodesToCheck = buildCoopCodes(codesOption);
  const { seasonal = [], leggacy = [] } = await fetchActiveContracts();
  const summaries = await fetchContractSummaries();
  const nameById = new Map(summaries.map(c => [c.id, c.name || c.id]));
  const combined = [...seasonal, ...leggacy];

  await interaction.deferReply();

  let selectedContracts;
  if (contractInput === '__ALL__') {
    selectedContracts = combined.map(([name, id]) => [nameById.get(id) || name, id]);
  } else if (contractInput === '__ALL_SEASONAL__') {
    selectedContracts = seasonal.map(([name, id]) => [nameById.get(id) || name, id]);
  } else {
    const matched = combined.find(([, id]) => id === contractInput);
    if (matched) {
      const [name, id] = matched;
      selectedContracts = [[nameById.get(id) || name, id]];
    } else {
      const displayName = nameById.get(contractInput) || contractInput;
      selectedContracts = [[displayName, contractInput]];
    }
  }

  if (!selectedContracts.length) {
    await interaction.editReply(createTextComponentMessage('No contracts matched your selection.', { flags: 64 }));
    return;
  }

  let resultsMessage = '';
  for (const [name, id] of selectedContracts) {
    const { filteredResults, coopCodes } = await findFreeCoopCodes(id, coopCodesToCheck);
    const line = filteredResults.length > 0
      ? `**${name}**: \`${filteredResults.join('`, `')}\`\n(${filteredResults.length}/${coopCodes.length} codes available)`
      : `**${name}**: No free coops found.`;
    resultsMessage += line + '\n\n';
  }

  const message = resultsMessage || 'No data found.';
  const chunkOptions = copyOutput ? { wrap: { prefix: '```', suffix: '```' } } : undefined;
  const chunks = chunkContent(message.split('\n'), chunkOptions);
  const [first, ...rest] = chunks;

  await interaction.editReply(createTextComponentMessage(first));
  for (const chunk of rest) {
    await interaction.followUp(createTextComponentMessage(chunk));
  }
}

async function buildStaticContractOptions() {
  const { seasonal = [], leggacy = [] } = await fetchActiveContracts();
  const combined = [...seasonal, ...leggacy];

  const options = [
    { name: 'All (Seasonal + Leggacy)', value: '__ALL__', description: 'Includes seasonal and leggacy' },
    { name: 'All Seasonal', value: '__ALL_SEASONAL__', description: 'Seasonal contracts only' },
    ...combined.map(([name, id]) => ({ name, value: id, description: id })),
  ];

  return options.slice(0, 25);
}

async function respondWithContracts(interaction, focused) {
  const contracts = await fetchContractSummaries();
  const sorted = [...contracts].sort((a, b) => (b.release ?? 0) - (a.release ?? 0));
  const lower = focused.toLowerCase();
  const filtered = sorted
    .filter(contract => {
      const id = contract.id?.toLowerCase() ?? '';
      const name = contract.name?.toLowerCase() ?? '';
      return id.includes(lower) || name.includes(lower);
    })
    .slice(0, 15)
    .map(contract => {
      const label = contract.name || contract.id;
      const description = contract.name ? contract.id : undefined;
      return { name: label, value: contract.id, description };
    });

  await interaction.respond(filtered);
}

export async function autocomplete(interaction) {
  const focusedValue = interaction.options.getFocused() ?? '';

  if (!focusedValue.trim()) {
    const options = await buildStaticContractOptions();
    await interaction.respond(options);
    return;
  }

  // When the user starts typing, switch to contract search so they can enter any id.
  await respondWithContracts(interaction, focusedValue);
}

export default { data, execute, autocomplete };
