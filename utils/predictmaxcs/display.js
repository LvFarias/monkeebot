import { ArtifactEmoji } from '../../Enums.js';
import { DEFLECTOR_TIERS } from './constants.js';
import { formatDeflectorDisplay } from './deflector.js';
import { computeAdjustedSummaries } from './simulation.js';
import { calcBoostMulti } from './tokens.js';

function getArtifactEmoji(typeKey, tier) {
  const key = `${typeKey}_${tier}`;
  return ArtifactEmoji[key] ?? ArtifactEmoji[`${typeKey}_4`] ?? ArtifactEmoji[typeKey] ?? key;
}

function getStoneIcons(isThreeSlotOption) {
  if (!isThreeSlotOption) return '';
  const stone = ArtifactEmoji.NEO_MEDALLION_4 ?? 'NEO_MEDALLION_4';
  return `${stone}`;
}

function parseArtifactName(name) {
  const text = String(name ?? '');
  const tierMatch = /T(\d)/i.exec(text);
  const rarityMatch = /T\d([LERC])/i.exec(text);
  const tier = tierMatch ? Number(tierMatch[1]) : 4;
  const rarity = rarityMatch ? rarityMatch[1].toUpperCase() : '';
  const isSiab = /siab/i.test(text);
  return { tier, rarity, isSiab };
}

function formatArtifactEntry(artifact, typeKey) {
  if (!artifact) return '---';
  const name = artifact?.name ?? '';
  const isThreeSlotOption = /^\s*3\s*slot\s*$/i.test(name);
  if (isThreeSlotOption) {
    return getStoneIcons(true) || 'NEO_MEDALLION_4';
  }

  const { tier, rarity, isSiab } = parseArtifactName(name);
  const emojiType = isSiab ? 'SIAB' : typeKey;
  const emoji = getArtifactEmoji(emojiType, tier);
  const stones = getStoneIcons(false);
  const rarityText = rarity ? `${rarity}` : '';
  const stoneText = stones ? `(${stones})` : '';
  return `${emoji}${rarityText}${stoneText}`;
}

function formatArtifactColumn(artifacts) {
  if (!artifacts) return '---';
  const deflectorText = formatArtifactEntry(artifacts.deflector, 'DEFLECTOR');
  const metroText = formatArtifactEntry(artifacts.metro, 'METRONOME');
  const compassText = formatArtifactEntry(artifacts.compass, 'COMPASS');
  const gussetText = formatArtifactEntry(artifacts.gusset, 'GUSSET');
  return `${deflectorText} ${metroText} ${compassText} ${gussetText}`.trim();
}

function buildTokenBoostText({ tokenUpgrade, tokensForPrediction, players }) {
  const lateBoostCount = tokenUpgrade?.bestCount ?? 0;
  const earlyBoostCount = tokenUpgrade?.earlyBestCount ?? 0;
  const tokensByPlayer = Array.isArray(tokenUpgrade?.tokensByPlayer)
    ? tokenUpgrade.tokensByPlayer
    : [];
  const lastTokens = tokensByPlayer[players - 1] ?? tokensForPrediction;
  const earlyTokens = tokensByPlayer[1] ?? 4;
  const earlyBoostText = earlyBoostCount > 0
    ? ` | first ${earlyBoostCount} use ${earlyTokens} toks`
    : '';
  const lateBoostText = lateBoostCount > 0
    ? ` | last ${lateBoostCount} use ${lastTokens} toks`
    : '';
  return `${earlyBoostText}${lateBoostText}`;
}

function buildSiabDeltaLine(usePlayer1Siab, siabScoreDelta) {
  if (!Number.isFinite(siabScoreDelta)) return null;
  const status = usePlayer1Siab ? 'on' : 'off';
  const sign = siabScoreDelta >= 0 ? '+' : '';
  return `SIAB (P1): ${status} | ΔCS ${sign}${siabScoreDelta}`;
}

function buildModifierLine(modifierType, modifierValue) {
  if (!modifierType) return null;
  const valueText = Number.isFinite(modifierValue) ? ` x${modifierValue}` : '';
  return `Contract modifier: ${modifierType}${valueText}`;
}

export function buildPlayerTableLines(model, assumptions) {
  const {
    players,
    durationSeconds,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    stoneLayout,
    baseIHR,
    playerIHRs,
    requiredDeflector,
    playerSummaries,
    tokensForPrediction,
    hasFixedTokens,
    tokensByPlayer,
    tokenUpgrade,
    deflectorDisplay,
    playerConfigs,
    playerArtifacts,
    usePlayer1Siab,
    siabScoreDelta,
    modifierType,
    modifierValue,
  } = model;

  const requiredOtherDeflector = Math.ceil(requiredDeflector);
  const {
    displayDeflectors,
    unusedDeflector,
  } = deflectorDisplay;

  const {
    adjustedSummaries,
    adjustedMaxCS,
    adjustedMinCS,
    adjustedMeanCS,
  } = computeAdjustedSummaries({
    summaries: playerSummaries.summaries,
    displayDeflectors,
    durationSeconds,
    players,
    assumptions,
  });

  const tokenEmoji = ArtifactEmoji.TOKEN;

  const effectiveTokens = Array.isArray(tokensByPlayer) && tokensByPlayer.length === players
    ? tokensByPlayer
    : Array.from({ length: players }, () => tokensForPrediction);
  const ggText = gg ? 'on' : 'off';
  const boostText = buildTokenBoostText({ tokenUpgrade, tokensForPrediction, players });
  const siabDeltaText = buildSiabDeltaLine(usePlayer1Siab, siabScoreDelta);
  const modifierText = buildModifierLine(modifierType, modifierValue);

  const displayRows = adjustedSummaries.map((summary, index) => ({
    summary,
    deflector: displayDeflectors[index],
    tokens: effectiveTokens[index],
    artifacts: Array.isArray(playerArtifacts) ? playerArtifacts[index] : null,
  }));

  const hasArtifacts = Array.isArray(playerArtifacts) && playerArtifacts.length === players;

  const lines = [
    `Token timer: ${formatMinutes(tokenTimerMinutes)} | gift speed: ${formatMinutes(giftMinutes)} | GG: ${ggText}`,
    `Average TE: ${assumptions.te}`,
    `Tokens to boost: ${tokenEmoji} ${tokensForPrediction}${hasFixedTokens ? '' : ' (fastest max-habs)'}${boostText}`,
    `Deflector needed (other total): ~${requiredOtherDeflector}% | Unused: ~${Math.max(0, Math.floor(unusedDeflector))}%`,
    `CS: max ${Math.round(adjustedMaxCS)} | mean ${Math.round(adjustedMeanCS)} | min ${Math.round(adjustedMinCS)}`,
    ...(siabDeltaText ? [siabDeltaText] : []),
    ...(modifierText ? [modifierText] : []),
    '',
    hasArtifacts
      ? '`player  (cr b) |   artifacts    |tach|quant|toks| cs`'
      : '`player  (cr b) |siab|def|tach|quant|toks| cs`',
    ...displayRows.map(row => {
      const { summary, deflector, tokens, artifacts } = row;
      const isScrub = deflector === DEFLECTOR_TIERS[0].percent;
      const baseTach = summary.stoneLayout?.numTach ?? stoneLayout.numTach;
      const baseQuant = summary.stoneLayout?.numQuant ?? stoneLayout.numQuant;
      const extraTach = isScrub && baseTach > baseQuant ? 1 : 0;
      const extraQuant = isScrub && baseQuant >= baseTach ? 1 : 0;
      const tachText = `${ArtifactEmoji.TACHYON_4} ${baseTach + extraTach}`;
      const quantText = `${ArtifactEmoji.QUANTUM_4} ${baseQuant + extraQuant}`;
      const tokenText = `${tokenEmoji} ${tokens}`;
      const siabText = summary.siabPercent > 0 ? ArtifactEmoji.SIAB_4 : '---';
      const artifactText = formatArtifactColumn(artifacts);
      const playerPad = players >= 10 && summary.index < 10 ? ' ' : '';
      const boostMulti = calcBoostMulti(Number.isFinite(tokens) ? tokens : tokensForPrediction);
      const maxHabs = playerConfigs?.[summary.index - 1]?.maxChickens ?? 0;
      const playerIHR = Array.isArray(playerIHRs) ? playerIHRs[summary.index - 1] : baseIHR;
      const crRequestPop = getChickenRunAskPop({
        maxChickens: maxHabs,
        baseIHR: playerIHR,
        boostMulti,
        players,
      });
      const crBillions = formatBillions(crRequestPop);
      const crPad = crBillions.length <= 3 ? ' ' : '';
      const playerText = `\`player${summary.index}${playerPad} (${crBillions})${crPad}\``;
      if (hasArtifacts) {
        return `${playerText} | ${artifactText} | ${tachText} | ${quantText} | ${tokenText} | ${Math.round(summary.cs)}`;
      }
      return `${playerText} | ${siabText} | ${formatDeflectorDisplay(deflector)} | ${tachText} | ${quantText} | ${tokenText} | ${Math.round(summary.cs)}`;
    }),
  ];

  return lines;
}

export function formatEggs(value) {
  if (value >= 1e18) return `${(value / 1e18).toFixed(2)}Q`;
  if (value >= 1e15) return `${(value / 1e15).toFixed(2)}q`;
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  return value.toLocaleString();
}

export function formatMinutes(minutes) {
  if (!Number.isFinite(minutes)) return 'N/A';
  if (minutes >= 60 * 24) return `${(minutes / 1440).toFixed(2)}d`;
  if (minutes >= 60) return `${(minutes / 60).toFixed(2)}h`;
  return `${minutes.toFixed(1)}m`;
}

export function formatBillions(value) {
  if (!Number.isFinite(value)) return 'N/A';
  return (value / 1e9).toFixed(1);
}

export function getChickenRunAskPop(options) {
  const {
    maxChickens,
    baseIHR,
    boostMulti,
    players,
  } = options;

  if (!Number.isFinite(maxChickens) || maxChickens <= 0) return 0;
  const safePlayers = Number.isFinite(players) ? players : 0;
  const safeBoost = Number.isFinite(boostMulti) && boostMulti > 0 ? boostMulti : 1;
  const safeIHR = Number.isFinite(baseIHR) && baseIHR > 0 ? baseIHR : 0;
  const offlineLoss = safeIHR * 12 * safeBoost;
  const denominator = 1 + 0.05 * safePlayers;
  if (denominator <= 0) return 0;
  return Math.max(0, (maxChickens - offlineLoss) / denominator);
}

export function secondsToHuman(seconds) {
  if (!Number.isFinite(seconds)) return 'N/A';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
