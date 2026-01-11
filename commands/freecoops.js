import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { fetchActiveContracts } from '../services/contractService.js';
import { findFreeCoopCodes } from '../services/coopService.js';
import { chunkContent, createTextComponentMessage } from '../services/discord.js';

const CODE_OPTION_DEFAULT = 'default';
const CODE_OPTION_EXTENDED = 'extended';
const CODE_OPTION_EXTENDED_PLUS = 'extended_plus';

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
  const coopCodesToCheck = buildCoopCodes(codesOption);
  const { seasonal = [], leggacy = [] } = await fetchActiveContracts();
  const combined = [...seasonal, ...leggacy];

  const options = [
    {
      label: 'All (Seasonal + Leggacy)',
      value: '__ALL__',
      description: 'Check all listed contracts',
    },
    {
      label: 'All Seasonal',
      value: '__ALL_SEASONAL__',
      description: 'Check only seasonal contracts',
    },
    ...combined.map(([name, id]) => ({
      label: name,
      value: id,
    })),
  ];

  const menu = new StringSelectMenuBuilder()
    .setCustomId('select_contract')
    .setPlaceholder('Choose a contract')
    .addOptions(options);

  await interaction.deferReply();

  const message = await interaction.editReply(
    createTextComponentMessage('Select a contract to check free coops:', {
      components: [new ActionRowBuilder().addComponents(menu)],
    })
  );

  const collector = message.createMessageComponentCollector({
    filter: i => i.customId === 'select_contract' && i.user.id === interaction.user.id,
    time: 60_000,
    max: 1,
  });

  collector.on('collect', async i => {
    await i.update(createTextComponentMessage('Checking for free coops...', { components: [] }));

    const selectedValue = i.values[0];

    // Normalize selected contracts into a list
    let selectedContracts;
    if (selectedValue === '__ALL__') {
      selectedContracts = combined;
    } else if (selectedValue === '__ALL_SEASONAL__') {
      selectedContracts = seasonal;
    } else {
      const selectedEntry = combined.find(([, id]) => id === selectedValue);
      selectedContracts = selectedEntry ? [selectedEntry] : [];
    }

    if (!selectedContracts.length) {
      await interaction.followUp(
        createTextComponentMessage('No contracts matched your selection.', { flags: 64 })
      );
      return;
    }

    // Generate results for the list
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

    await interaction.followUp(createTextComponentMessage(first));
    for (const chunk of rest) {
      await interaction.followUp(createTextComponentMessage(chunk));
    }
  });
}
