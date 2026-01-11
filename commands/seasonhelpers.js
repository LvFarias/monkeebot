import { SlashCommandBuilder } from 'discord.js';
import { fetchSeasonHelpers, listSeasons } from '../services/seasonService.js';
import { chunkContent, createTextComponentMessage } from '../services/discord.js';

export const data = new SlashCommandBuilder()
  .setName('seasonhelpers')
  .setDescription('List helper contributions for a given season')
  .addStringOption(option =>
    option.setName('season')
      .setDescription('Season number')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addBooleanOption(option =>
    option.setName('push_only')
      .setDescription('Only include push runs (default: false)')
      .setRequired(false)
  )
  .addBooleanOption(option =>
    option.setName('seasonal_only')
      .setDescription('Only includes seasonal contracts (default: true)')
      .setRequired(false)
  )
  .addBooleanOption(option =>
    option
      .setName('copy')
      .setDescription('Wrap the output in a code block for easier copying')
      .setRequired(false)
  );

export async function execute(interaction) {
  const season = interaction.options.getString('season');
  const pushOnly = interaction.options.getBoolean('push_only');
  const pushOnlyFlag = pushOnly === true;
  const seasonalOnlyInput = interaction.options.getBoolean('seasonal_only');
  const seasonalOnly = seasonalOnlyInput !== false;
  const copyOutput = interaction.options.getBoolean('copy') ?? false;
  const helpers = await fetchSeasonHelpers({ season, pushOnly: pushOnlyFlag, seasonalOnly });
  if (!helpers.length) {
    await interaction.reply(
      createTextComponentMessage(`No helpers found for season ${season}.`, { flags: 64 })
    );
    return;
  }

  // Format the output nicely
  const lines = helpers.map(h => {
    const base = `<@${h.discord_id}> (${h.count})`;
    const altEntries = Array.isArray(h.breakdown)
      ? h.breakdown.filter(part => part.discord_id !== h.discord_id)
      : [];
    if (!altEntries.length) {
      return base;
    }

    const mainEntry = Array.isArray(h.breakdown)
      ? h.breakdown.find(part => part.discord_id === h.discord_id)
      : null;

    const detailParts = [];
    if (mainEntry) {
      detailParts.push(`${mainEntry.count}`);
    }
    for (const alt of altEntries) {
      detailParts.push(`${alt.count}`);
    }

    return `${base} [${detailParts.join(' + ')}]`;
  });
  const scopeLabel = pushOnlyFlag ? 'Push helpers' : 'All helpers';
  const rangeLabel = seasonalOnly ? 'Seasonal only' : 'All contracts';
  const messageLines = [`**${scopeLabel} for Season ${season} (${rangeLabel})**`, '', ...lines];
  const chunkOptions = copyOutput ? { wrap: { prefix: '```', suffix: '```' } } : {};
  const chunks = chunkContent(messageLines, chunkOptions);

  const [first, ...rest] = chunks;
  await interaction.reply(
    createTextComponentMessage(first, { allowedMentions: { users: [] } })
  );
  for (const chunk of rest) {
    await interaction.followUp(
      createTextComponentMessage(chunk, { allowedMentions: { users: [] } })
    );
  }
}

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const allSeasons = listSeasons();
  const filtered = allSeasons
    .filter(s => s.toLowerCase().includes(focused))
    .slice(0, 4);

  await interaction.respond(filtered.map(s => ({ name: s, value: s })));
}

export default { data, execute, autocomplete };
