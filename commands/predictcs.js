import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { chunkContent, createTextComponentMessage } from '../services/discord.js';
import { fetchContractSummaries } from '../services/contractService.js';
import { findContractMatch } from '../utils/predictmaxcs/contracts.js';
import { buildPlayerTableLines, formatEggs, secondsToHuman } from '../utils/predictmaxcs/display.js';
import {
  DEFAULT_COMPASS,
  DEFAULT_DEFLECTOR,
  DEFAULT_GUSSET,
  DEFAULT_IHR_CHALICE,
  DEFAULT_IHR_DEFLECTOR,
  DEFAULT_IHR_MONOCLE,
  DEFAULT_IHR_SIAB,
  DEFAULT_METRO,
  DEFLECTOR_OPTIONS,
  IHR_CHALICE_OPTIONS,
  IHR_DEFLECTOR_OPTIONS,
  IHR_MONOCLE_OPTIONS,
  IHR_SIAB_OPTIONS,
  METRO_OPTIONS,
  COMPASS_OPTIONS,
  GUSSET_OPTIONS,
  parseCompass,
  parseDeflector,
  parseGusset,
  parseIhrChalice,
  parseIhrDeflector,
  parseIhrMonocle,
  parseIhrSiab,
  parseMetro,
  parseTe,
} from '../utils/predictcs/artifacts.js';
import { buildBoostOrder, buildPredictCsModel } from '../utils/predictcs/model.js';
import { parseSandboxUrl } from '../utils/predictcs/sandbox.js';

const sessions = new Map();

const TE_OPTIONS = [
  0, 5, 10, 15, 20, 25, 30, 35, 40, 50,
  60, 70, 80, 90, 100, 120, 140, 160, 180, 200,
  225, 250, 300, 400, 490,
];

export const data = new SlashCommandBuilder()
  .setName('predictcs')
  .setDescription('Predict CS using per-player artifacts and TE inputs.')
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
  .addStringOption(option =>
    option
      .setName('boost_order')
      .setDescription('Boost order to simulate')
      .addChoices(
        { name: 'input order', value: 'input' },
        { name: 'te order', value: 'te' },
        { name: 'random', value: 'random' },
      )
      .setRequired(true)
  )
  .addBooleanOption(option =>
    option
      .setName('gg')
      .setDescription('Double tokens per gift (GG)')
      .setRequired(false)
  );

export async function execute(interaction) {
  const contractInput = interaction.options.getString('contract');
  const tokenSpeedInput = interaction.options.getNumber('token_speed');
  const gg = interaction.options.getBoolean('gg') ?? false;
  const boostOrderMode = interaction.options.getString('boost_order');
  const siabEnabled = true;

  const contracts = await fetchContractSummaries();
  const contractMatch = findContractMatch(contracts, contractInput);
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

  const sessionId = interaction.id;
  sessions.set(sessionId, {
    sessionId,
    userId: interaction.user?.id,
    contractLabel: contractMatch?.name || contractMatch?.id || contractInput,
    players,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    boostOrderMode,
    siabEnabled,
    modifierType: contractMatch?.modifierType ?? null,
    modifierValue: contractMatch?.modifierValue ?? null,
    contracts,
    mode: 'select',
    playerArtifacts: Array.from({ length: players }, () => ({
      deflector: parseDeflector(DEFAULT_DEFLECTOR),
      metro: parseMetro(DEFAULT_METRO),
      compass: parseCompass(DEFAULT_COMPASS),
      gusset: parseGusset(DEFAULT_GUSSET),
    })),
    playerIhrArtifacts: Array.from({ length: players }, () => ({
      chalice: parseIhrChalice(DEFAULT_IHR_CHALICE),
      monocle: parseIhrMonocle(DEFAULT_IHR_MONOCLE),
      deflector: parseIhrDeflector(DEFAULT_IHR_DEFLECTOR),
      siab: parseIhrSiab(DEFAULT_IHR_SIAB),
    })),
    playerTe: Array.from({ length: players }, () => 0),
    playerStep: Array.from({ length: players }, () => 'artifacts'),
  });

  const message = buildModeSelectionMessage(sessionId, sessions.get(sessionId));
  await interaction.reply(message);
}

export async function handleComponentInteraction(interaction) {
  if (!interaction.isMessageComponent()) return false;

  const customId = interaction.customId ?? '';
  const context = parsePredictCsContext(customId);
  if (!context) return false;

  const { action, sessionId, playerIndex, field, mode } = context;
  const session = sessions.get(sessionId);
  if (action === 'mode') {
    const isValid = await validatePredictCsSessionOwnership(interaction, session);
    if (!isValid) return true;

    if (!interaction.isButton()) return true;

    if (mode === 'manual') {
      session.mode = 'manual';
      session.playerStep[0] = 'artifacts';
      const message = buildPlayerSelectionMessage(sessionId, 0, session, { includeFlags: false });
      await interaction.update(message);
      return true;
    }

    if (mode === 'sandbox') {
      session.mode = 'sandbox';
      const modal = buildSandboxModal(sessionId);
      await interaction.showModal(modal);
      return true;
    }

    return true;
  }

  if (action === 'contract') {
    const isValid = await validatePredictCsSessionOwnership(interaction, session);
    if (!isValid) return true;

    if (!interaction.isButton()) return true;

    const reminder = session?.sandboxData;
    if (!reminder) {
      await interaction.reply(createTextComponentMessage('Sandbox data expired. Please run the command again.', { flags: 64 }));
      return true;
    }

    if (mode === 'selected') {
      await runPredictCsSandbox(interaction, session, reminder, {
        contractLabel: session.contractLabel,
        durationSeconds: session.durationSeconds,
        targetEggs: session.targetEggs,
        tokenTimerMinutes: session.tokenTimerMinutes,
      });
      return true;
    }

    if (mode === 'sandbox') {
      const override = resolveSandboxContractOverride(session);
      await runPredictCsSandbox(interaction, session, reminder, override);
      return true;
    }

    return true;
  }

  if (action === 'contractselect') {
    const isValid = await validatePredictCsSessionOwnership(interaction, session);
    if (!isValid) return true;

    if (!interaction.isStringSelectMenu()) return true;
    const selectedId = interaction.values?.[0];
    session.sandboxContractSelection = selectedId;
    const message = buildContractMismatchMessage(session, { includeFlags: false });
    await interaction.update(message);
    return true;
  }

  const isValid = await validatePredictCsSession(interaction, session, playerIndex);
  if (!isValid) return true;

  if (action === 'select' && interaction.isStringSelectMenu()) {
    await handlePredictCsSelect({ interaction, sessionId, playerIndex, field, session });
    return true;
  }

  if (action === 'next' && interaction.isButton()) {
    await handlePredictCsNext({ interaction, sessionId, playerIndex, session });
    return true;
  }

  return false;
}

export async function handleModalSubmit(interaction) {
  const customId = interaction.customId ?? '';
  if (!customId.startsWith('predictcs:sandbox:')) return;

  const sessionId = customId.split(':')[2];
  const session = sessions.get(sessionId);
  const isValid = await validatePredictCsSessionOwnership(interaction, session);
  if (!isValid) return;

  const sandboxUrl = interaction.fields.getTextInputValue('sandbox_url');
  const sandbox = parseSandboxUrl(sandboxUrl);
  if (sandbox.error) {
    await interaction.reply(createTextComponentMessage(`Sandbox parse error: ${sandbox.error}`, { flags: 64 }));
    return;
  }

  if (sandbox.players !== session.players) {
    await interaction.reply(createTextComponentMessage(
      `Sandbox player count (${sandbox.players}) does not match contract players (${session.players}).`,
      { flags: 64 },
    ));
    return;
  }

  session.sandboxData = sandbox;

  const mismatch = hasSandboxContractMismatch(session, sandbox.contractInfo);
  if (mismatch) {
    session.sandboxMatches = findSandboxContractMatches(session, sandbox.contractInfo);
    session.sandboxContractSelection = session.sandboxMatches?.[0]?.id ?? null;
    const message = buildContractMismatchMessage(session, { includeFlags: true });
    await interaction.reply(message);
    return;
  }

  await runPredictCsSandbox(interaction, session, sandbox, {
    contractLabel: session.contractLabel,
    durationSeconds: session.durationSeconds,
    targetEggs: session.targetEggs,
    tokenTimerMinutes: session.tokenTimerMinutes,
  });
}

function parsePredictCsContext(customId) {
  if (!customId.startsWith('predictcs:')) return null;
  const parts = customId.split(':');
  const action = parts[1];
  if (action === 'mode') {
    return { action, sessionId: parts[2], mode: parts[3] };
  }
  if (action === 'contract') {
    return { action, sessionId: parts[2], mode: parts[3] };
  }
  if (action === 'contractselect') {
    return { action, sessionId: parts[2] };
  }
  const sessionId = parts[2];
  const playerIndex = Number(parts[3]);
  const field = parts[4];
  return { action, sessionId, playerIndex, field };
}

async function validatePredictCsSession(interaction, session, playerIndex) {
  if (!session || !Number.isInteger(playerIndex)) {
    await interaction.reply(createTextComponentMessage('This form has expired. Please run the command again.', { flags: 64 }));
    return false;
  }

  if (session.userId && interaction.user?.id && session.userId !== interaction.user.id) {
    await interaction.reply(createTextComponentMessage('This form belongs to someone else.', { flags: 64 }));
    return false;
  }

  return true;
}

async function validatePredictCsSessionOwnership(interaction, session) {
  if (!session) {
    await interaction.reply(createTextComponentMessage('This form has expired. Please run the command again.', { flags: 64 }));
    return false;
  }

  if (session.userId && interaction.user?.id && session.userId !== interaction.user.id) {
    await interaction.reply(createTextComponentMessage('This form belongs to someone else.', { flags: 64 }));
    return false;
  }

  return true;
}

async function handlePredictCsSelect({ interaction, sessionId, playerIndex, field, session }) {
  const value = interaction.values?.[0] ?? '';
  if (field === 'deflector') {
    session.playerArtifacts[playerIndex].deflector = parseDeflector(value);
  } else if (field === 'metro') {
    session.playerArtifacts[playerIndex].metro = parseMetro(value);
  } else if (field === 'compass') {
    session.playerArtifacts[playerIndex].compass = parseCompass(value);
  } else if (field === 'gusset') {
    session.playerArtifacts[playerIndex].gusset = parseGusset(value);
  } else if (field === 'ihr_chalice') {
    session.playerIhrArtifacts[playerIndex].chalice = parseIhrChalice(value);
  } else if (field === 'ihr_monocle') {
    session.playerIhrArtifacts[playerIndex].monocle = parseIhrMonocle(value);
  } else if (field === 'ihr_deflector') {
    session.playerIhrArtifacts[playerIndex].deflector = parseIhrDeflector(value);
  } else if (field === 'ihr_siab') {
    session.playerIhrArtifacts[playerIndex].siab = parseIhrSiab(value);
  } else if (field === 'te') {
    session.playerTe[playerIndex] = parseTe(value);
  }

  const message = buildPlayerSelectionMessage(sessionId, playerIndex, session, { includeFlags: false });
  await interaction.update(message);
}

async function handlePredictCsNext({ interaction, sessionId, playerIndex, session }) {
  const step = session.playerStep[playerIndex] ?? 'artifacts';
  const selection = session.playerArtifacts[playerIndex];
  const ihrSelection = session.playerIhrArtifacts[playerIndex];
  const teValue = session.playerTe[playerIndex];
  const hasArtifacts = selection?.deflector && selection?.metro && selection?.compass && selection?.gusset;
  const hasIhrArtifacts = ihrSelection?.chalice && ihrSelection?.monocle && ihrSelection?.deflector && ihrSelection?.siab;

  if (step === 'artifacts') {
    if (!hasArtifacts) {
      await interaction.reply(createTextComponentMessage('Select all artifacts before continuing.', { flags: 64 }));
      return;
    }

    session.playerStep[playerIndex] = 'ihr';
    const message = buildPlayerSelectionMessage(sessionId, playerIndex, session, { includeFlags: false });
    await interaction.update(message);
    return;
  }

  if (step === 'ihr') {
    if (!hasIhrArtifacts) {
      await interaction.reply(createTextComponentMessage('Select all IHR artifacts before continuing.', { flags: 64 }));
      return;
    }

    session.playerStep[playerIndex] = 'te';
    const message = buildPlayerSelectionMessage(sessionId, playerIndex, session, { includeFlags: false });
    await interaction.update(message);
    return;
  }

  if (!Number.isFinite(teValue)) {
    await interaction.reply(createTextComponentMessage('Select a TE value before continuing.', { flags: 64 }));
    return;
  }

  const nextIndex = playerIndex + 1;
  if (nextIndex < session.players) {
    session.playerStep[nextIndex] = 'artifacts';
    const nextMessage = buildPlayerSelectionMessage(sessionId, nextIndex, session, { includeFlags: false });
    await interaction.update(nextMessage);
    return;
  }

  const boostOrder = buildBoostOrder(session.boostOrderMode, session.playerTe);
  const model = buildPredictCsModel({
    players: session.players,
    durationSeconds: session.durationSeconds,
    targetEggs: session.targetEggs,
    tokenTimerMinutes: session.tokenTimerMinutes,
    giftMinutes: session.giftMinutes,
    gg: session.gg,
    playerArtifacts: session.playerArtifacts,
    playerIhrArtifacts: session.playerIhrArtifacts,
    playerTe: session.playerTe,
    boostOrder,
    siabEnabled: session.siabEnabled,
    modifierType: session.modifierType,
    modifierValue: session.modifierValue,
  });

  const avgTe = session.playerTe.reduce((sum, value) => sum + value, 0) / Math.max(1, session.playerTe.length);
  const assumptions = {
    te: Math.round(avgTe),
    tokensPerPlayer: 0,
    swapBonus: false,
    cxpMode: true,
    siabPercent: 0,
  };

  const outputLines = buildPlayerTableLines(model, assumptions);
  outputLines.unshift(`Players: ${session.players} | Duration: ${secondsToHuman(session.durationSeconds)} | Target: ${formatEggs(session.targetEggs)}`);

  const chunks = chunkContent(outputLines, { maxLength: 3800, separator: '\n' });
  const embeds = chunks.map((chunk, index) => new EmbedBuilder()
    .setTitle(index === 0
      ? `PredictCS (${session.contractLabel})`
      : 'PredictCS (cont.)')
    .setDescription(chunk));

  const [first, ...rest] = embeds;
  await interaction.update(buildPlainComponentMessage('PredictCS complete. See results below.', { components: [] }));
  await interaction.followUp({ embeds: [first] });
  for (const embed of rest) {
    await interaction.followUp({ embeds: [embed] });
  }

  sessions.delete(sessionId);
}

function buildPlayerSelectionMessage(sessionId, playerIndex, session, { includeFlags }) {
  const selection = session.playerArtifacts[playerIndex];
  const ihrSelection = session.playerIhrArtifacts[playerIndex];
  const teValue = session.playerTe[playerIndex] ?? 0;
  const step = session.playerStep[playerIndex] ?? 'artifacts';

  const deflectorOptions = buildSelectOptions(DEFLECTOR_OPTIONS, selection?.deflector?.name ?? DEFAULT_DEFLECTOR);
  const metroOptions = buildSelectOptions(METRO_OPTIONS, selection?.metro?.name ?? DEFAULT_METRO);
  const compassOptions = buildSelectOptions(COMPASS_OPTIONS, selection?.compass?.name ?? DEFAULT_COMPASS);
  const gussetOptions = buildSelectOptions(GUSSET_OPTIONS, selection?.gusset?.name ?? DEFAULT_GUSSET);
  const ihrChaliceOptions = buildSelectOptions(IHR_CHALICE_OPTIONS, ihrSelection?.chalice?.name ?? DEFAULT_IHR_CHALICE);
  const ihrMonocleOptions = buildSelectOptions(IHR_MONOCLE_OPTIONS, ihrSelection?.monocle?.name ?? DEFAULT_IHR_MONOCLE);
  const ihrDeflectorOptions = buildSelectOptions(IHR_DEFLECTOR_OPTIONS, ihrSelection?.deflector?.name ?? DEFAULT_IHR_DEFLECTOR);
  const ihrSiabOptions = buildSelectOptions(IHR_SIAB_OPTIONS, ihrSelection?.siab?.name ?? DEFAULT_IHR_SIAB);
  const teOptions = buildTeOptions(teValue);

  const deflectorMenu = new StringSelectMenuBuilder()
    .setCustomId(`predictcs:select:${sessionId}:${playerIndex}:deflector`)
    .setPlaceholder('Select deflector')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(deflectorOptions);

  const metroMenu = new StringSelectMenuBuilder()
    .setCustomId(`predictcs:select:${sessionId}:${playerIndex}:metro`)
    .setPlaceholder('Select metronome')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(metroOptions);

  const compassMenu = new StringSelectMenuBuilder()
    .setCustomId(`predictcs:select:${sessionId}:${playerIndex}:compass`)
    .setPlaceholder('Select compass')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(compassOptions);

  const gussetMenu = new StringSelectMenuBuilder()
    .setCustomId(`predictcs:select:${sessionId}:${playerIndex}:gusset`)
    .setPlaceholder('Select gusset/SIAB')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(gussetOptions);

  const ihrChaliceMenu = new StringSelectMenuBuilder()
    .setCustomId(`predictcs:select:${sessionId}:${playerIndex}:ihr_chalice`)
    .setPlaceholder('Select chalice (IHR)')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(ihrChaliceOptions);

  const ihrMonocleMenu = new StringSelectMenuBuilder()
    .setCustomId(`predictcs:select:${sessionId}:${playerIndex}:ihr_monocle`)
    .setPlaceholder('Select monocle (IHR)')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(ihrMonocleOptions);

  const ihrDeflectorMenu = new StringSelectMenuBuilder()
    .setCustomId(`predictcs:select:${sessionId}:${playerIndex}:ihr_deflector`)
    .setPlaceholder('Select deflector (IHR)')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(ihrDeflectorOptions);

  const ihrSiabMenu = new StringSelectMenuBuilder()
    .setCustomId(`predictcs:select:${sessionId}:${playerIndex}:ihr_siab`)
    .setPlaceholder('Select SIAB (IHR)')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(ihrSiabOptions);

  const teMenu = new StringSelectMenuBuilder()
    .setCustomId(`predictcs:select:${sessionId}:${playerIndex}:te`)
    .setPlaceholder('Select TE')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(teOptions);

  let nextLabel = 'Run PredictCS';
  if (step === 'artifacts') {
    nextLabel = 'Next (IHR)';
  } else if (step === 'ihr') {
    nextLabel = 'Next (TE)';
  } else if (playerIndex + 1 < session.players) {
    nextLabel = 'Next Player';
  }

  const nextButton = new ButtonBuilder()
    .setCustomId(`predictcs:next:${sessionId}:${playerIndex}`)
    .setLabel(nextLabel)
    .setStyle(ButtonStyle.Primary);

  let helperText = 'Select TE, then press Next to continue.';
  if (step === 'artifacts') {
    helperText = 'Press Next to choose IHR artifacts.';
  } else if (step === 'ihr') {
    helperText = 'Press Next to choose TE.';
  }

  const summaryLines = [
    `Player ${playerIndex + 1}/${session.players}`,
    `Deflector: ${selection?.deflector?.name ?? DEFAULT_DEFLECTOR}`,
    `Metronome: ${selection?.metro?.name ?? DEFAULT_METRO}`,
    `Compass: ${selection?.compass?.name ?? DEFAULT_COMPASS}`,
    `Gusset/SIAB: ${selection?.gusset?.name ?? DEFAULT_GUSSET}`,
    `IHR Chalice: ${ihrSelection?.chalice?.name ?? DEFAULT_IHR_CHALICE}`,
    `IHR Monocle: ${ihrSelection?.monocle?.name ?? DEFAULT_IHR_MONOCLE}`,
    `IHR Deflector: ${ihrSelection?.deflector?.name ?? DEFAULT_IHR_DEFLECTOR}`,
    `IHR SIAB: ${ihrSelection?.siab?.name ?? DEFAULT_IHR_SIAB}`,
    `TE: ${Number.isFinite(teValue) ? teValue : 0}`,
    helperText,
  ];

  let components = [
    new ActionRowBuilder().addComponents(teMenu),
    new ActionRowBuilder().addComponents(nextButton),
  ];

  if (step === 'artifacts') {
    components = [
      new ActionRowBuilder().addComponents(deflectorMenu),
      new ActionRowBuilder().addComponents(metroMenu),
      new ActionRowBuilder().addComponents(compassMenu),
      new ActionRowBuilder().addComponents(gussetMenu),
      new ActionRowBuilder().addComponents(nextButton),
    ];
  } else if (step === 'ihr') {
    components = [
      new ActionRowBuilder().addComponents(ihrChaliceMenu),
      new ActionRowBuilder().addComponents(ihrMonocleMenu),
      new ActionRowBuilder().addComponents(ihrDeflectorMenu),
      new ActionRowBuilder().addComponents(ihrSiabMenu),
      new ActionRowBuilder().addComponents(nextButton),
    ];
  }

  return buildPlainComponentMessage(summaryLines.join('\n'), {
    components,
    flags: includeFlags ? 64 : null,
  });
}

function buildModeSelectionMessage(sessionId, session) {
  const manualButton = new ButtonBuilder()
    .setCustomId(`predictcs:mode:${sessionId}:manual`)
    .setLabel('Manual input')
    .setStyle(ButtonStyle.Primary);

  const sandboxButton = new ButtonBuilder()
    .setCustomId(`predictcs:mode:${sessionId}:sandbox`)
    .setLabel('Sandbox URL')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(manualButton, sandboxButton);
  const summary = [
    `Contract: ${session.contractLabel}`,
    `Players: ${session.players}`,
    'Choose a flow before starting player inputs.',
  ];

  return buildPlainComponentMessage(summary.join('\n'), {
    components: [row],
    flags: 64,
  });
}

function buildSandboxModal(sessionId) {
  const modal = new ModalBuilder()
    .setCustomId(`predictcs:sandbox:${sessionId}`)
    .setTitle('PredictCS Sandbox Import');

  const input = new TextInputBuilder()
    .setCustomId('sandbox_url')
    .setLabel('Paste sandbox URL or data string')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const row = new ActionRowBuilder().addComponents(input);
  modal.addComponents(row);
  return modal;
}

function hasSandboxContractMismatch(session, sandboxContract) {
  if (!sandboxContract) return false;
  const durationMatch = Number.isFinite(sandboxContract.durationSeconds)
    ? sandboxContract.durationSeconds === session.durationSeconds
    : true;
  const targetMatch = Number.isFinite(sandboxContract.targetEggs)
    ? sandboxContract.targetEggs === session.targetEggs
    : true;
  const tokenMatch = Number.isFinite(sandboxContract.tokenTimerMinutes)
    ? sandboxContract.tokenTimerMinutes === session.tokenTimerMinutes
    : true;
  return !(durationMatch && targetMatch && tokenMatch);
}

function findSandboxContractMatches(session, sandboxContract) {
  if (!sandboxContract || !Array.isArray(session.contracts)) return [];
  return session.contracts.filter(contract => (
    Number.isFinite(contract?.maxCoopSize)
      ? contract.maxCoopSize === sandboxContract.players
      : true
  ) && (
    Number.isFinite(contract?.coopDurationSeconds)
      ? contract.coopDurationSeconds === sandboxContract.durationSeconds
      : false
  ) && (
    Number.isFinite(contract?.eggGoal)
      ? contract.eggGoal === sandboxContract.targetEggs
      : false
  ) && (
    Number.isFinite(contract?.minutesPerToken)
      ? contract.minutesPerToken === sandboxContract.tokenTimerMinutes
      : false
  ));
}

function resolveSandboxContractOverride(session) {
  const matches = session.sandboxMatches ?? [];
  const selectedId = session.sandboxContractSelection;
  const picked = matches.find(contract => contract.id === selectedId) ?? matches[0];

  if (picked) {
    return {
      contractLabel: picked.name ? `${picked.name} (${picked.id})` : picked.id,
      durationSeconds: picked.coopDurationSeconds,
      targetEggs: picked.eggGoal,
      tokenTimerMinutes: picked.minutesPerToken,
      modifierType: picked.modifierType ?? null,
      modifierValue: picked.modifierValue ?? null,
    };
  }

  return {
    contractLabel: 'Custom (Sandbox)',
    durationSeconds: session.sandboxData?.contractInfo?.durationSeconds ?? session.durationSeconds,
    targetEggs: session.sandboxData?.contractInfo?.targetEggs ?? session.targetEggs,
    tokenTimerMinutes: session.sandboxData?.contractInfo?.tokenTimerMinutes ?? session.tokenTimerMinutes,
    modifierType: session.modifierType ?? null,
    modifierValue: session.modifierValue ?? null,
  };
}

function buildContractMismatchMessage(session, { includeFlags }) {
  const sandboxInfo = session.sandboxData?.contractInfo ?? {};
  const matches = session.sandboxMatches ?? [];

  const lines = [
    'Sandbox contract info does not match the selected contract.',
    `Selected: ${session.contractLabel}`,
    `Duration: ${secondsToHuman(session.durationSeconds)} | Target: ${formatEggs(session.targetEggs)} | Token: ${session.tokenTimerMinutes}m`,
  ];

  if (Number.isFinite(sandboxInfo.durationSeconds) && Number.isFinite(sandboxInfo.targetEggs) && Number.isFinite(sandboxInfo.tokenTimerMinutes)) {
    lines.push(`Sandbox: ${secondsToHuman(sandboxInfo.durationSeconds)} | Target: ${formatEggs(sandboxInfo.targetEggs)} | Token: ${sandboxInfo.tokenTimerMinutes}m`);
  }

  const components = [];

  if (matches.length > 0) {
    const options = matches.slice(0, 25).map(contract => ({
      label: contract.name ? `${contract.name} (${contract.id})` : contract.id,
      value: contract.id,
      default: contract.id === session.sandboxContractSelection,
    }));

    const select = new StringSelectMenuBuilder()
      .setCustomId(`predictcs:contractselect:${session.sessionId}`)
      .setPlaceholder('Select matching contract')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options);

    components.push(new ActionRowBuilder().addComponents(select));
  }

  const selectedButton = new ButtonBuilder()
    .setCustomId(`predictcs:contract:${session.sessionId}:selected`)
    .setLabel('Use selected contract')
    .setStyle(ButtonStyle.Primary);

  const sandboxButton = new ButtonBuilder()
    .setCustomId(`predictcs:contract:${session.sessionId}:sandbox`)
    .setLabel(matches.length > 0 ? 'Use sandbox-matched contract' : 'Use sandbox values')
    .setStyle(ButtonStyle.Secondary);

  components.push(new ActionRowBuilder().addComponents(selectedButton, sandboxButton));

  return buildPlainComponentMessage(lines.join('\n'), {
    components,
    flags: includeFlags ? 64 : null,
  });
}

async function runPredictCsSandbox(interaction, session, sandboxData, contractOverride) {
  const { players } = session;
  const playerArtifacts = sandboxData.playerArtifacts;
  const playerIhrArtifacts = sandboxData.playerIhrArtifacts;
  const playerTe = sandboxData.playerTe;

  const boostOrder = buildBoostOrder(session.boostOrderMode, playerTe);
  const model = buildPredictCsModel({
    players,
    durationSeconds: contractOverride.durationSeconds,
    targetEggs: contractOverride.targetEggs,
    tokenTimerMinutes: contractOverride.tokenTimerMinutes,
    giftMinutes: session.giftMinutes,
    gg: session.gg,
    playerArtifacts,
    playerIhrArtifacts,
    playerTe,
    boostOrder,
    siabEnabled: session.siabEnabled,
    modifierType: contractOverride.modifierType ?? null,
    modifierValue: contractOverride.modifierValue ?? null,
  });

  const avgTe = playerTe.reduce((sum, value) => sum + value, 0) / Math.max(1, playerTe.length);
  const assumptions = {
    te: Math.round(avgTe),
    tokensPerPlayer: 0,
    swapBonus: false,
    cxpMode: true,
    siabPercent: 0,
  };

  const outputLines = buildPlayerTableLines(model, assumptions);
  outputLines.unshift(`Players: ${players} | Duration: ${secondsToHuman(contractOverride.durationSeconds)} | Target: ${formatEggs(contractOverride.targetEggs)}`);

  const chunks = chunkContent(outputLines, { maxLength: 3800, separator: '\n' });
  const embeds = chunks.map((chunk, index) => new EmbedBuilder()
    .setTitle(index === 0
      ? `PredictCS (${contractOverride.contractLabel})`
      : 'PredictCS (cont.)')
    .setDescription(chunk));

  const [first, ...rest] = embeds;

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ embeds: [first] });
  } else {
    await interaction.reply({ embeds: [first] });
  }

  for (const embed of rest) {
    await interaction.followUp({ embeds: [embed] });
  }

  sessions.delete(session.sessionId);
}

function buildPlainComponentMessage(content, options = {}) {
  const { components = [], flags, allowedMentions } = options;
  const message = {
    content: content == null ? ' ' : String(content),
    components,
    allowedMentions: allowedMentions ?? { parse: [], users: [], roles: [] },
  };

  if (Number.isInteger(flags)) {
    message.flags = flags;
  }

  return message;
}

function buildSelectOptions(options, selectedName) {
  return options.map(option => ({
    label: option.name,
    value: option.name,
    default: option.name === selectedName,
  }));
}

function buildTeOptions(selectedValue) {
  return TE_OPTIONS.map(value => ({
    label: value === 0 ? '0 (none)' : `${value}`,
    value: String(value),
    default: Number(selectedValue) === value,
  }));
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
