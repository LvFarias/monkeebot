import { SlashCommandBuilder } from 'discord.js';
import { requireMamaBird } from '../utils/permissions.js';
import { extractDiscordId, chunkContent, createTextComponentMessage } from '../services/discord.js';
import { linkAltAccount, unlinkAltAccount } from '../services/coopService.js';
import { setIgnForMember, setMembersActiveStatus, syncMembersFromApiEntries } from '../services/memberService.js';

const API_URL = 'https://eiapi-production.up.railway.app/allMaj';
const MAX_DETAIL_ROWS = 5;

function formatConflict(conflict) {
  const others = (conflict.conflictDiscordIds ?? [])
    .map(id => `<@${id}>`)
    .join(', ') || 'unknown member(s)';
  return `- IGN \`${conflict.ign}\` for <@${conflict.discordId}> conflicts with ${others}`;
}

function formatInvalid(entry) {
  const idText = entry.discordId ? `<@${entry.discordId}>` : '`(missing id)`';
  const ignText = entry.ign ? `\`${entry.ign}\`` : '`(missing ign)`';
  return `- ${idText} ${ignText}`;
}

function formatSkipped(entry) {
  return formatInvalid(entry);
}

async function fetchMembersPayload() {
  const response = await fetch(API_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`request failed with status ${response.status}`);
  }
  return response.json();
}

async function loadMembersPayload(interaction) {
  try {
    const payload = await fetchMembersPayload();
    if (!Array.isArray(payload)) {
      await interaction.editReply(
        createTextComponentMessage('Unexpected API response: expected an array of member records.', { flags: 64 })
      );
      return null;
    }
    return payload;
  } catch (err) {
    await interaction.editReply(
      createTextComponentMessage(`Failed to fetch member data: ${err.message ?? err}`, { flags: 64 })
    );
    return null;
  }
}

function appendSection(lines, items, title, formatter) {
  if (!items || items.length === 0) return;

  lines.push('', title);
  for (const entry of items.slice(0, MAX_DETAIL_ROWS)) {
    lines.push(formatter(entry));
  }
}

function formatFailure(entry) {
  const reason = entry.reason ? ` (${entry.reason})` : '';
  return `${formatInvalid(entry)}${reason}`;
}

function buildSummaryLines(summary) {
  const lines = [
    `processed ${summary.total} records`,
    `updated: ${summary.updated}`,
    `unchanged: ${summary.unchanged}`,
    `conflicts: ${summary.conflicts.length}`,
    `invalid: ${summary.invalid.length}`,
    `skipped: ${summary.skipped.length}`,
    `failures: ${summary.failures.length}`,
  ];

  appendSection(lines, summary.conflicts, 'conflicts (first few):', formatConflict);
  appendSection(lines, summary.invalid, 'invalid entries (first few):', formatInvalid);
  appendSection(lines, summary.skipped, 'skipped (first few):', formatSkipped);
  appendSection(lines, summary.failures, 'failures (first few):', formatFailure);

  return lines;
}

async function sendSummaryChunks(interaction, lines) {
  const chunks = chunkContent(lines);
  const [first, ...rest] = chunks;

  await interaction.editReply(createTextComponentMessage(first, { flags: 64 }));
  for (const chunk of rest) {
    await interaction.followUp(createTextComponentMessage(chunk, { flags: 64 }));
  }
}

function parseTargetIdentifiers(rawTargets) {
  if (!rawTargets) {
    return { ids: [], invalid: [] };
  }

  const tokens = rawTargets
    .split(/[\s,]+/)
    .map(token => token.trim())
    .filter(Boolean);

  const ids = new Set();
  const invalid = [];

  for (const token of tokens) {
    const id = extractDiscordId(token);
    if (!id) {
      invalid.push(token);
      continue;
    }
    ids.add(id);
  }

  return { ids: [...ids], invalid };
}

function formatMentions(ids) {
  return ids.map(id => `<@${id}>`).join(', ');
}

async function handleSetAlt(interaction) {
  const mainInput = interaction.options.getString('main');
  const altInput = interaction.options.getString('alt');

  const mainId = extractDiscordId(mainInput);
  const altId = extractDiscordId(altInput);

  if (!mainId || !altId) {
    await interaction.reply(
      createTextComponentMessage('Please provide valid Discord IDs or mentions for both main and alt.', { flags: 64 })
    );
    return;
  }

  const result = linkAltAccount({ main: mainId, alt: altId });

  if (!result.ok) {
    let reason;
    switch (result.reason) {
      case 'invalid-input':
        reason = 'Missing main or alt ID.';
        break;
      case 'same-id':
        reason = 'Main and alt cannot be the same ID.';
        break;
      case 'main-is-alt':
        reason = 'The specified main is already marked as an alt of another account.';
        break;
      case 'alt-already-linked':
        reason = 'That alt is already linked to a different main. Remove it first.';
        break;
      case 'already-set':
        reason = 'That alt is already linked to the specified main.';
        break;
      case 'alt-has-children':
        reason = 'That account already has alts linked to it and cannot be set as an alt.';
        break;
      default:
        reason = result.reason ? `Unable to link alt: ${result.reason}.` : 'Unable to link alt.';
        break;
    }

    await interaction.reply(createTextComponentMessage(reason, { flags: 64 }));
    return;
  }

  const details = result.details ?? {};
  const mainDiscord = details.main?.discord_id ?? mainId;
  const altDiscord = details.alt?.discord_id ?? altId;

  await interaction.reply(
    createTextComponentMessage(`Linked <@${altDiscord}> as an alt of <@${mainDiscord}>.`, { flags: 64 })
  );
}

async function handleRemoveAlt(interaction) {
  const mainInput = interaction.options.getString('main');
  const altInput = interaction.options.getString('alt');

  const mainId = extractDiscordId(mainInput);
  const altId = extractDiscordId(altInput);

  if (!mainId || !altId) {
    await interaction.reply(
      createTextComponentMessage('Please provide valid Discord IDs or mentions for both main and alt.', { flags: 64 })
    );
    return;
  }

  const result = unlinkAltAccount({ main: mainId, alt: altId });
  if (!result.ok) {
    let reason;
    switch (result.reason) {
      case 'invalid-input':
        reason = 'Missing main or alt ID.';
        break;
      case 'not-found':
        reason = 'Main or alt account was not found in the database.';
        break;
      case 'not-linked':
        reason = 'That alt is not currently linked to the specified main.';
        break;
      default:
        reason = result.reason ? `Unable to remove alt: ${result.reason}.` : 'Unable to remove alt link.';
        break;
    }

    await interaction.reply(createTextComponentMessage(reason, { flags: 64 }));
    return;
  }

  const details = result.details ?? {};
  const mainDiscord = details.main?.discord_id ?? mainId;
  const altDiscord = details.alt?.discord_id ?? altId;

  await interaction.reply(
    createTextComponentMessage(`Removed alt link: <@${altDiscord}> is no longer linked to <@${mainDiscord}>.`, { flags: 64 })
  );
}

async function handleSetIgn(interaction) {
  const userInput = interaction.options.getString('user');
  const ignInput = interaction.options.getString('ign');

  const targetId = extractDiscordId(userInput);
  if (!targetId) {
    await interaction.reply(createTextComponentMessage('Please provide a valid Discord ID or mention.', { flags: 64 }));
    return;
  }

  const result = setIgnForMember({ targetDiscordId: targetId, ign: ignInput });
  if (!result.ok) {
    let message;
    switch (result.reason) {
      case 'invalid-ign':
        message = 'Please provide a non-empty IGN.';
        break;
      case 'conflict':
        if (result.conflictDiscordIds?.length) {
          const mentions = result.conflictDiscordIds.map(id => `<@${id}>`).join(', ');
          message = `IGN already linked to ${mentions}.`;
        } else {
          message = 'IGN already linked to another member.';
        }
        break;
      case 'not-found':
        message = `No existing member record for <@${targetId}>. Add them to the database first.`;
        break;
      case 'invalid-id':
        message = 'Unable to find a member for that Discord ID.';
        break;
      default:
        message = `Failed to set IGN: ${result.reason ?? 'unknown error'}.`;
        break;
    }

    await interaction.reply(createTextComponentMessage(message, { flags: 64 }));
    return;
  }

  if (result.status === 'unchanged') {
    await interaction.reply(
      createTextComponentMessage(`IGN for <@${targetId}> is already set to \`${result.ign}\`.`, { flags: 64 })
    );
    return;
  }

  await interaction.reply(
    createTextComponentMessage(`Set IGN for <@${targetId}> to \`${result.ign}\`.`, { flags: 64 })
  );
}

async function handleUpdateMembers(interaction) {
  await interaction.deferReply({ flags: 64 });

  const payload = await loadMembersPayload(interaction);
  if (!payload) return;

  const summary = syncMembersFromApiEntries(payload);

  const lines = buildSummaryLines(summary);
  await sendSummaryChunks(interaction, lines);
}

async function handleSetActive(interaction) {
  const targetsInput = interaction.options.getString('targets');
  const activeValue = interaction.options.getBoolean('active');

  const { ids, invalid } = parseTargetIdentifiers(targetsInput);

  if (ids.length === 0) {
    await interaction.reply(
      createTextComponentMessage('Provide at least one valid Discord ID or mention to update.', { flags: 64 })
    );
    return;
  }

  const result = setMembersActiveStatus({ targetDiscordIds: ids, active: activeValue });
  if (!result.ok) {
    let message = 'Failed to update active status.';
    if (result.reason === 'invalid-active') {
      message = 'Provide whether members should be active (true or false).';
    } else if (result.reason === 'no-targets') {
      message = 'Provide at least one member to update.';
    }

    await interaction.reply(createTextComponentMessage(message, { flags: 64 }));
    return;
  }

  const lines = [`Set active=${activeValue ? 'true' : 'false'} for ${ids.length} member(s).`];

  if (result.updated.length > 0) {
    lines.push(`updated: ${formatMentions(result.updated)}`);
  }

  if (result.created.length > 0) {
    lines.push(`created: ${formatMentions(result.created)}`);
  }

  if (result.unchanged.length > 0) {
    lines.push(`unchanged: ${formatMentions(result.unchanged)}`);
  }

  if (invalid.length > 0) {
    lines.push(`ignored invalid tokens: ${invalid.join(', ')}`);
  }

  if (result.failures.length > 0) {
    const details = result.failures
      .map(item => {
        let s = "<@" + item.discordId + ">";
        if (item.reason) s += " (" + item.reason + ")";
        return s;
      })
      .join(', ');

    lines.push(`failures: ${details}`);
  }

  const chunks = chunkContent(lines);
  const [first, ...rest] = chunks;

  await interaction.reply(createTextComponentMessage(first, { flags: 64 }));
  for (const chunk of rest) {
    await interaction.followUp(createTextComponentMessage(chunk, { flags: 64 }));
  }
}

export const data = new SlashCommandBuilder()
  .setName('member')
  .setDescription('Manage member records')
  .addSubcommand(subcommand =>
    subcommand
      .setName('setalt')
      .setDescription('Link an alt account to a main account')
      .addStringOption(option =>
        option
          .setName('main')
          .setDescription('Main account (mention or ID)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('alt')
          .setDescription('Alt account (mention or ID)')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('removealt')
      .setDescription('Remove an alt link from a main account')
      .addStringOption(option =>
        option
          .setName('main')
          .setDescription('Main account (mention or ID)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('alt')
          .setDescription('Alt account (mention or ID)')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('setign')
      .setDescription('Link an IGN to a Discord user')
      .addStringOption(option =>
        option
          .setName('user')
          .setDescription('Discord mention or ID to link')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('ign')
          .setDescription('In-game name to assign')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('updatemembers')
      .setDescription('Sync member IGNs from the Maj API dataset')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('setactive')
      .setDescription('Set whether members are active')
      .addStringOption(option =>
        option
          .setName('targets')
          .setDescription('Space or comma separated Discord mentions or IDs')
          .setRequired(true)
      )
      .addBooleanOption(option =>
        option
          .setName('active')
          .setDescription('Set to true to mark active, false to mark inactive')
          .setRequired(true)
      )
  );

export async function execute(interaction) {
  if (!(await requireMamaBird(interaction))) return;

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'setalt':
      await handleSetAlt(interaction);
      break;
    case 'removealt':
      await handleRemoveAlt(interaction);
      break;
    case 'setign':
      await handleSetIgn(interaction);
      break;
    case 'updatemembers':
      await handleUpdateMembers(interaction);
      break;
    case 'setactive':
      await handleSetActive(interaction);
      break;
    default:
      await interaction.reply(createTextComponentMessage('Unknown member subcommand.', { flags: 64 }));
      break;
  }
}

export default { data, execute };
