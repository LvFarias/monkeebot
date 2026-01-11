import { SlashCommandBuilder } from 'discord.js';
import { fetchPushReports } from '../services/coopService.js';
import { listSeasons } from '../services/seasonService.js';
import { chunkContent, MAX_DISCORD_COMPONENT_LENGTH, createTextComponentMessage } from '../services/discord.js';
import EggtoEmoji from '../Enums.js';

function formatLine({ egg, name, contract, coop, report }) {
  const eggKey = String(egg || 'UNKNOWN').trim().toUpperCase();
  const eggText = EggtoEmoji[eggKey] || EggtoEmoji.UNKNOWN || eggKey;
  const nameText = name || 'Unnamed Contract';
  const contractText = contract || 'unknown-contract';
  const coopText = coop || 'unknown-coop';
  const reportText = report ? report.trim() : '';

  const encodedContract = encodeURIComponent(contractText);
  const encodedCoop = encodeURIComponent(coopText);
  const link = `https://eicoop-carpet.netlify.app/${encodedContract}/${encodedCoop}`;
  const reportLink = reportText ? '[Report](<' + reportText + '>)' : '';

  return `* ${eggText} ${nameText} [${coopText}](<${link}>) ${reportLink}`;
}

export const data = new SlashCommandBuilder()
  .setName('pushreport')
  .setDescription('Summarize completed push runs for a season')
  .addStringOption(option =>
    option
      .setName('season')
      .setDescription('Season identifier (e.g. fall_2025)')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addBooleanOption(option =>
    option
      .setName('copy')
      .setDescription('Wrap the output in a code block for easier copying')
      .setRequired(false)
  );

export async function execute(interaction) {
  const season = interaction.options.getString('season');
  const copyOutput = interaction.options.getBoolean('copy') ?? false;
  const rows = fetchPushReports(season);

  if (!rows || rows.length === 0) {
    await interaction.reply(
      createTextComponentMessage(`No push runs recorded for season ${season}.`, { flags: 64 })
    );
    return;
  }

  const header = ` # Completed runs - ${season}`;
  const lines = rows
    .map(formatLine)
    .filter(Boolean);
  const epoch = Math.floor(Date.now() / 1000);
  const footer = `-# </pushreport:1426337967068414054> <t:${epoch}:d>`;
  const contentLines = [header, ...lines];
  const chunkOptions = { maxLength: MAX_DISCORD_COMPONENT_LENGTH };
  if (copyOutput) {
    chunkOptions.wrap = { prefix: '```', suffix: '```' };
  }
  let chunks = chunkContent(copyOutput ? [...contentLines, footer] : contentLines, chunkOptions);

  if (!copyOutput) {
    if (chunks.length === 0) {
      chunks = [`${header}\n${footer}`];
    } else {
      const lastIndex = chunks.length - 1;
      const candidate = `${chunks[lastIndex]}\n${footer}`;
      if (candidate.length <= MAX_DISCORD_COMPONENT_LENGTH) {
        chunks[lastIndex] = candidate;
      } else {
        chunks.push(footer);
      }
    }
  }

  const [first, ...rest] = chunks;
  const buildComponentPayload = content =>
    createTextComponentMessage(content, {
      allowedMentions: { users: [], parse: [] },
    });
  const sendChunk = async content => {
    const payload = buildComponentPayload(content);
    if (interaction.channel?.send) {
      try {
        await interaction.channel.send(payload);
        return;
      } catch (error) {
        console.warn('pushreport chunk channel send failed; falling back to followUp', error);
      }
    }

    await interaction.followUp(payload);
  };

  await interaction.reply(buildComponentPayload(first));
  for (const chunk of rest) {
    await sendChunk(chunk);
  }
}

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const allSeasons = listSeasons();
  const filtered = allSeasons
    .filter(season => season.toLowerCase().includes(focused))
    .slice(0, 4);

  await interaction.respond(
    filtered.map(season => ({ name: season, value: season }))
  );
}

export default { data, execute, autocomplete };
