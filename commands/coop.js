import { SlashCommandBuilder } from 'discord.js';
import { requireMamaBird } from '../utils/permissions.js';
import {
  addCoopFromInput,
  removeCoop as removeCoopRecord,
  updatePushFlag,
  addPlayersToCoop,
  addCoopIfMissing,
  listCoops,
  saveCoopReport,
  clearCoopReport,
  removePlayersFromCoopService,
  autoPopulateCoopMembers,
} from '../services/coopService.js';
import { isValidHttpUrl, chunkContent, createTextComponentMessage } from '../services/discord.js';
import { fetchContractSummaries } from '../services/contractService.js';

const CONTRACT_OPTION = 'contract';
const COOP_OPTION = 'coop';

export const data = new SlashCommandBuilder()
  .setName('coop')
  .setDescription('Manage coops and participants')
  .addSubcommand(subcommand =>
    subcommand
      .setName('addcoop')
      .setDescription('Add a coop by providing its URL or contract/coop path')
      .addStringOption(option =>
        option
          .setName('url')
          .setDescription('Full URL or contract/coop path')
          .setRequired(false)
      )
      .addStringOption(option =>
        option
          .setName('contract')
          .setDescription('Contract id')
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('coop')
          .setDescription('Coop id')
      )
      .addBooleanOption(option =>
        option
          .setName('push')
          .setDescription('Mark this coop as push')
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('setpush')
      .setDescription('Set or unset the push flag for a coop')
      .addStringOption(option =>
        option
          .setName(CONTRACT_OPTION)
          .setDescription('Contract id')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName(COOP_OPTION)
          .setDescription('Coop id')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addBooleanOption(option =>
        option
          .setName('push')
          .setDescription('Set push to true or false')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('addplayers')
      .setDescription('Link players to a coop')
      .addStringOption(option =>
        option
          .setName(CONTRACT_OPTION)
          .setDescription('Contract id')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName(COOP_OPTION)
          .setDescription('Coop id')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('users')
          .setDescription('Discord mentions or IDs to add')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('addreport')
      .setDescription('Attach a report link to a coop')
      .addStringOption(option =>
        option
          .setName(CONTRACT_OPTION)
          .setDescription('Contract id')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName(COOP_OPTION)
          .setDescription('Coop id')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('report')
          .setDescription('Report link (http or https)')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('removecoop')
      .setDescription('Remove a coop from the database')
      .addStringOption(option =>
        option
          .setName(CONTRACT_OPTION)
          .setDescription('Contract id')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName(COOP_OPTION)
          .setDescription('Coop id')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('removeplayer')
      .setDescription('Remove players from a coop')
      .addStringOption(option =>
        option
          .setName(CONTRACT_OPTION)
          .setDescription('Contract id')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName(COOP_OPTION)
          .setDescription('Coop id')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('users')
          .setDescription('Discord mentions or IDs to remove')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('removereport')
      .setDescription('Remove the report link for a coop')
      .addStringOption(option =>
        option
          .setName(CONTRACT_OPTION)
          .setDescription('Contract id')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName(COOP_OPTION)
          .setDescription('Coop id')
          .setRequired(true)
          .setAutocomplete(true)
      )
  );

function normalizeText(value) {
  return value ? value.trim() : '';
}

async function handleAddCoop(interaction) {
  const options = parseAddCoopOptions(interaction);
  if (!options.ok) {
    await interaction.reply(createTextComponentMessage(options.message, { flags: 64 }));
    return;
  }

  await interaction.deferReply();

  const result = await addCoopFromInput({ rawInput: options.rawInput, push: options.pushFlag });
  if (!result.ok) {
    const message = buildAddCoopFailureMessage(result);
    await interaction.editReply(
      createTextComponentMessage(message, { allowedMentions: { users: [] } })
    );
    return;
  }

  const autoResult = await autoPopulateCoopMembers(result.contract, result.coop);
  const lines = buildAddCoopSuccessLines(result, autoResult);

  // If the coop was added with push=true, append a note telling the user to add a report later
  if (options.pushFlag) {
    lines.push('', 'This coop was added as a push coop, add a report after the coop finishes with </coop addreport:1427617464535089254>');
  }

  await sendChunkedReply(interaction, lines);
}

function parseAddCoopOptions(interaction) {
  const url = normalizeText(interaction.options.getString('url'));
  const contract = normalizeText(interaction.options.getString(CONTRACT_OPTION));
  const coop = normalizeText(interaction.options.getString(COOP_OPTION));
  const pushFlag = interaction.options.getBoolean('push') ?? false;

  let rawInput = url;
  if (rawInput && (contract || coop)) {
    return { ok: false, message: 'Provide either a URL or a contract/coop pair, not both.' };
  }

  if (!rawInput) {
    if (contract && coop) {
      rawInput = `${contract}/${coop}`;
    } else if (contract || coop) {
      return { ok: false, message: 'Provide both contract and coop when not supplying a URL.' };
    }
  }

  if (!rawInput) {
    return { ok: false, message: 'Provide a coop URL or contract/coop pair.' };
  }

  return { ok: true, rawInput, pushFlag };
}

function buildAddCoopFailureMessage(result) {
  switch (result.reason) {
    case 'missing-input':
      return 'Please provide a coop URL or path.';
    case 'invalid-path':
      return 'Invalid path. Expected format: contract/coop or full URL.';
    case 'unknown-contract':
      return `Invalid contract id: \`${result.contract}\`.`;
    case 'exists':
      return `Coop \`${result.contract}/${result.coop}\` already exists.`;
    case 'invalid-input':
      return 'Invalid contract or coop identifier.';
    default:
      return `Error adding coop: ${result.reason ?? 'unknown error'}`;
  }
}

function buildAddCoopSuccessLines(result, autoResult) {
  const lines = [`Added coop: \`${result.contract}/${result.coop}\``];

  if (autoResult.ok) {
    appendAutoMatchedSection(lines, autoResult.matched);
    appendAutoMissingSection(lines, autoResult.missing);
    appendAutoDepartedSection(lines, autoResult.departedCount ?? 0);
  } else {
    appendAutoFailureSection(lines, autoResult.reason);
  }

  return lines;
}

function appendAutoMatchedSection(lines, matchedEntries) {
  lines.push('', 'automatically found:');
  if (matchedEntries.length === 0) {
    lines.push('(none)');
    return;
  }

  for (const entry of matchedEntries) {
    let status = ' (unchanged)';
    if (entry.status === 'already') {
      status = ' (already linked)';
    } else if (entry.status === 'linked') {
      status = '';
    }
    lines.push(`<@${entry.discordId}> \`${entry.ign}\`${status}`);
  }
}

function appendAutoMissingSection(lines, missing) {
  lines.push('', "wasn't able to find:");
  if (missing.length === 0) {
    lines.push('(none)');
    return;
  }

  for (const ign of missing) {
    lines.push(`\`${ign}\``);
  }
  lines.push('', 'please add them manually to the coop with </coop addplayers:1427617464535089254>', 'Also link their Discord with </member setign:1434988103046795324>', 'If they\'re a pchanned member, mark them as active with </member setactive:1434988103046795324>', 'If they\'re an alt, link them to their main with </member setalt:1434988103046795324>');
}

function appendAutoDepartedSection(lines, departedCount) {
  if (departedCount <= 0) return;

  const plural = departedCount === 1 ? '' : 's';
  lines.push(
    '',
    `${departedCount} player${plural} are \`[departed]\`; please manually check who they are and add them with </coop addplayers:1427617464535089254>`
  );
}

function appendAutoFailureSection(lines, reason = 'unknown error') {
  lines.push('', 'automatically found:', `(unable to fetch contributors: ${reason})`, '', "wasn't able to find:", '(unknown)');
}

async function sendChunkedReply(interaction, lines) {
  // Chunk long replies to stay within Discord's message limits.
  const chunks = chunkContent(lines);
  const [first, ...rest] = chunks;

  await interaction.editReply(
    createTextComponentMessage(first, { allowedMentions: { users: [] } })
  );
  for (const chunk of rest) {
    await interaction.followUp(
      createTextComponentMessage(chunk, { allowedMentions: { users: [] } })
    );
  }
}

function handleRemove(interaction) {
  const contract = interaction.options.getString(CONTRACT_OPTION);
  const coop = interaction.options.getString(COOP_OPTION);
  const result = removeCoopRecord({ contract, coop });

  const message = result.ok
    ? 'Coop removed from database.'
    : 'Coop not found or could not be removed.';

  return interaction.reply(createTextComponentMessage(message, { flags: 64 }));
}

function handleSetPush(interaction) {
  const contract = interaction.options.getString(CONTRACT_OPTION);
  const coop = interaction.options.getString(COOP_OPTION);
  const push = interaction.options.getBoolean('push');

  const result = updatePushFlag({ contract, coop, push });

  if (!result.ok && !result.already) {
    const message = `Failed to update push: ${result.reason ?? 'unknown error'}`;
    return interaction.reply(createTextComponentMessage(message, { flags: 64 }));
  }

  if (result.already) {
    return interaction.reply(
      createTextComponentMessage(`Push flag for ${contract}/${coop} was already set to ${push}.`, { flags: 64 })
    );
  }

  return interaction.reply(
    createTextComponentMessage(`Set push flag for ${contract}/${coop} to ${push}.`, { flags: 64 })
  );
}

async function handleAddPlayers(interaction) {
  const contract = normalizeText(interaction.options.getString(CONTRACT_OPTION));
  const coop = normalizeText(interaction.options.getString(COOP_OPTION));
  const userInput = interaction.options.getString('users');

  if (!contract || !coop || !userInput) {
    await interaction.reply(
      createTextComponentMessage('Invalid input. Please provide contract, coop, and user(s).', { flags: 64 })
    );
    return;
  }

  const ensure = await addCoopIfMissing(contract, coop);
  if (!ensure.ok) {
    await interaction.reply(
      createTextComponentMessage(`Failed to prepare coop: ${ensure.reason ?? 'unknown error'}`, { flags: 64 })
    );
    return;
  }

  const result = await addPlayersToCoop({ contract, coop, userInput });
  if (!result.ok) {
    let message = `Failed to link players: ${result.reason ?? 'unknown error'}`;
    if (result.reason === 'no-users') {
      message = 'No valid Discord IDs provided.';
    }
    await interaction.reply(createTextComponentMessage(message, { flags: 64 }));
    return;
  }

  const newly = result.newlyLinked.map(id => `<@${id}>`);
  const already = result.alreadyLinked.map(id => `<@${id}>`);

  const lines = [];
  let linkedLine = `Linked ${newly.length} player${newly.length === 1 ? '' : 's'}`;
  if (newly.length) {
    linkedLine += `: ${newly.join(' ')}`;
  }
  lines.push(linkedLine);
  if (already.length) {
    lines.push(`${already.join(' ')} ${already.length === 1 ? 'was' : 'were'} already in the coop.`);
  }
  lines.push(`Contract: **${contract}** / Coop: **${coop}**`);

  const chunks = chunkContent(lines);
  const [first, ...rest] = chunks;

  await interaction.reply(createTextComponentMessage(first, { flags: 64 }));
  for (const chunk of rest) {
    await interaction.followUp(createTextComponentMessage(chunk, { flags: 64 }));
  }
}

async function handleAddReport(interaction) {
  const contract = normalizeText(interaction.options.getString(CONTRACT_OPTION));
  const coop = normalizeText(interaction.options.getString(COOP_OPTION));
  const report = normalizeText(interaction.options.getString('report'));

  if (!contract || !coop || !report) {
    await interaction.reply(
      createTextComponentMessage('Please provide contract, coop, and report.', { flags: 64 })
    );
    return;
  }

  if (!isValidHttpUrl(report)) {
    await interaction.reply(createTextComponentMessage('Report must be a valid http(s) URL.', { flags: 64 }));
    return;
  }

  const ensure = await addCoopIfMissing(contract, coop);
  if (!ensure.ok) {
    await interaction.reply(
      createTextComponentMessage(`Failed to prepare coop: ${ensure.reason ?? 'unknown error'}`, { flags: 64 })
    );
    return;
  }

  const result = await saveCoopReport({ contract, coop, reportUrl: report });
  if (!result.ok) {
    let message = `Failed to store report: ${result.reason ?? 'unknown error'}`;
    if (result.reason === 'exists') {
      message = `A report already exists for ${contract}/${coop}. Remove it first.`;
    } else if (result.reason === 'invalid-url') {
      message = 'Report must be a valid http(s) URL.';
    }
    await interaction.reply(createTextComponentMessage(message, { flags: 64 }));
    return;
  }

  await interaction.reply(createTextComponentMessage(`Report saved for **${contract} / ${coop}**.`, { flags: 64 }));
}

function handleRemovePlayers(interaction) {
  const contract = interaction.options.getString(CONTRACT_OPTION);
  const coop = interaction.options.getString(COOP_OPTION);
  const userInput = interaction.options.getString('users');

  const result = removePlayersFromCoopService({ contract, coop, userInput });
  if (!result.ok) {
    let message = `Failed to remove players: ${result.reason ?? 'unknown error'}`;
    if (result.reason === 'no-users') {
      message = 'No valid Discord IDs provided.';
    } else if (result.reason === 'invalid-input') {
      message = 'Invalid input.';
    }
    return interaction.reply(createTextComponentMessage(message, { flags: 64 }));
  }

  const mentions = result.removedIds.length
    ? result.removedIds.map(id => `<@${id}>`).join(' ')
    : '';
  const summary = `Removed ${result.removedCount} user(s) from ${result.contract}/${result.coop}.`;
  const content = mentions ? `${summary}\n${mentions}` : summary;
  return interaction.reply(createTextComponentMessage(content, { flags: 64 }));
}

function handleRemoveReport(interaction) {
  const contract = normalizeText(interaction.options.getString(CONTRACT_OPTION));
  const coop = normalizeText(interaction.options.getString(COOP_OPTION));

  if (!contract || !coop) {
    return interaction.reply(createTextComponentMessage('Please provide both contract and coop.', { flags: 64 }));
  }

  const result = clearCoopReport({ contract, coop });
  if (!result.ok) {
    let message = `Failed to remove report: ${result.reason ?? 'unknown error'}`;
    if (result.reason === 'missing-report') {
      message = `No report is stored for ${contract}/${coop}.`;
    } else if (result.reason === 'invalid-input') {
      message = 'Please provide both contract and coop.';
    }
    return interaction.reply(createTextComponentMessage(message, { flags: 64 }));
  }

  return interaction.reply(createTextComponentMessage(`Report removed for **${contract} / ${coop}**.`, { flags: 64 }));
}

export async function execute(interaction) {
  if (!(await requireMamaBird(interaction))) return;

  const subcommand = interaction.options.getSubcommand();
  switch (subcommand) {
    case 'addcoop':
      await handleAddCoop(interaction);
      break;
    case 'removecoop':
      await handleRemove(interaction);
      break;
    case 'setpush':
      await handleSetPush(interaction);
      break;
    case 'addplayers':
      await handleAddPlayers(interaction);
      break;
    case 'addreport':
      await handleAddReport(interaction);
      break;
    case 'removeplayer':
      await handleRemovePlayers(interaction);
      break;
    case 'removereport':
      await handleRemoveReport(interaction);
      break;
    default:
        await interaction.reply(createTextComponentMessage(`Unknown subcommand: ${subcommand}`, { flags: 64 }));
  }
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

async function respondWithCoops(interaction, focused) {
  const contract = interaction.options.getString(CONTRACT_OPTION) || '';
  if (!contract) {
    await interaction.respond([]);
    return;
  }

  const coops = listCoops(contract);
  const lower = focused.toLowerCase();
  const filtered = coops
    .filter(c => c.toLowerCase().includes(lower))
    .slice(0, 25)
    .map(c => ({ name: c, value: c }));

  await interaction.respond(filtered);
}

export async function autocomplete(interaction) {
  const focusedValue = interaction.options.getFocused();
  const focusedOption = interaction.options.getFocused(true);
  const optionName = focusedOption?.name;

  if (optionName === CONTRACT_OPTION) {
    await respondWithContracts(interaction, focusedValue);
    return;
  }

  if (optionName === COOP_OPTION) {
    await respondWithCoops(interaction, focusedValue);
    return;
  }

  await interaction.respond([]);
}

export default { data, execute, autocomplete };
