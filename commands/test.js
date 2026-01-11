import { SlashCommandBuilder } from 'discord.js';
import OpenAI from 'openai';
import cosineSimilarity from 'cosine-similarity';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

import { listMembersWithoutIgn } from '../utils/database/membersRepository.js';
import { listRecentCoops } from '../utils/database/coopsRepository.js';
import { fetchCoopContributors } from '../utils/coopchecker.js';
import { chunkContent, createTextComponentMessage } from '../services/discord.js';

dotenv.config();

const NORMALIZATION_MAP = {
  0: 'o',
  1: 'l',
  3: 'e',
  4: 'a',
  5: 's',
  7: 't',
};

const DEPARTED_NAME = '[departed]';
const DEFAULT_COOP_LOOKBACK = 50;
const MAX_OUTPUT_LINES = 80;
const FAILURE_LIST_PREVIEW = 5;
const FETCH_CONCURRENCY = 5;

function normalizeIgn(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalize(str) {
  return str
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/g, '')
    .replaceAll(/[013457]/g, match => NORMALIZATION_MAP[match]);
}

function reversedContains(a, b) {
  const revA = normalize(a).split('').reverse().join('');
  const normB = normalize(b);
  return normB.includes(revA);
}

function fuzzyBonus(a, b) {
  const normA = normalize(a);
  const normB = normalize(b);
  let bonus = 0;

  if (normA && normB && (normA.includes(normB) || normB.includes(normA))) bonus += 0.15;
  if (reversedContains(a, b)) bonus += 0.2;

  return Math.min(bonus, 0.25);
}

function levenshtein(a, b) {
  const lenA = a.length;
  const lenB = b.length;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  const dp = Array.from({ length: lenA + 1 }, () => new Array(lenB + 1).fill(0));
  for (let i = 0; i <= lenA; i++) dp[i][0] = i;
  for (let j = 0; j <= lenB; j++) dp[0][j] = j;

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[lenA][lenB];
}

function lexicalSimilarity(a, b) {
  const normA = normalize(a);
  const normB = normalize(b);
  if (!normA && !normB) return 1;
  if (!normA || !normB) return 0;
  const distance = levenshtein(normA, normB);
  const scale = Math.max(normA.length, normB.length, 1);
  return 1 - distance / scale;
}

function normalizeVector(vec) {
  let sumSquares = 0;
  for (const value of vec) sumSquares += value * value;
  const magnitude = Math.sqrt(sumSquares) || 1;
  return vec.map(value => value / magnitude);
}

function semanticSimilarity(vecA, vecB) {
  const cosine = cosineSimilarity(vecA, vecB);
  return (cosine + 1) / 2;
}

function computeScore(discordName, ignName, discordVec, ignVec) {
  const semantic = semanticSimilarity(discordVec, ignVec);
  const lexical = lexicalSimilarity(discordName, ignName);
  const bonus = fuzzyBonus(discordName, ignName);
  const combined = 0.6 * semantic + 0.35 * lexical + bonus;
  return Math.min(combined, 1);
}

function formatMatchLine(record, sortedScores) {
  const topMatches = sortedScores.slice(0, 3).map(entry => `${entry.ign} (${entry.score.toFixed(2)})`);
  const best = sortedScores[0];
  const caution = best && best.score < 0.5 ? ' ⚠️' : '';
  return `${record.discordId} (${record.displayName}) → ${topMatches.join(', ')}${caution}`;
}

async function collectIgnsFromCoops(coops, concurrency = FETCH_CONCURRENCY) {
  const ignMap = new Map();
  const failedLookups = [];
  let index = 0;

  const workerCount = Math.min(concurrency, Math.max(coops.length, 1));

  function takeNextCoop() {
    const coop = coops[index];
    index += 1;
    return coop;
  }

  function addContributorIgn(contributor) {
    const ign = normalizeIgn(contributor?.userName);
    if (!ign) return;

    const lower = ign.toLowerCase();
    if (lower === DEPARTED_NAME) return;
    if (!ignMap.has(lower)) {
      ignMap.set(lower, ign);
    }
  }

  async function processCoop(coop) {
    try {
      const contributors = await fetchCoopContributors(coop.contract, coop.coop);
      if (!Array.isArray(contributors)) return;

      for (const contributor of contributors) addContributorIgn(contributor);
    } catch (err) {
      console.warn('Failed to fetch coop contributors', coop.contract, coop.coop, err);
      failedLookups.push(`${coop.contract}:${coop.coop}`);
    }
  }

  async function worker() {
    while (index < coops.length) {
      const coop = takeNextCoop();
      if (!coop) continue;

      await processCoop(coop);
    }
  }

  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  return { ignNames: [...ignMap.values()], failedLookups };
}

async function getEmbeddings(client, key, texts) {
  const cacheFile = path.join(process.cwd(), 'data', `embeddings_${key}.json`);
  if (fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (Array.isArray(cached)) {
        if (cached.length === texts.length) {
          return cached;
        }
      } else if (cached && Array.isArray(cached.texts) && Array.isArray(cached.embeddings)) {
        const matches = cached.texts.length === texts.length && cached.texts.every((value, index) => value === texts[index]);
        if (matches) {
          return cached.embeddings;
        }
      }
    } catch (err) {
      console.warn(`Failed to read embedding cache ${cacheFile}:`, err.message);
    }
  }

  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
  });
  const embeddings = response.data.map(obj => obj.embedding);
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify({ texts, embeddings }));
  return embeddings;
}

async function resolveDisplayName(interaction, discordId) {
  const guild = interaction.guild;
  if (guild) {
    const cachedMember = guild.members.cache.get(discordId);
    if (cachedMember) {
      return (
        cachedMember.displayName ??
        cachedMember.user?.globalName ??
        cachedMember.user?.username ??
        discordId
      );
    }

    const member = await guild.members
      .fetch(discordId)
      .catch(() => null);

    if (member) {
      return (
        member.displayName ??
        member.user?.globalName ??
        member.user?.username ??
        discordId
      );
    }
  }

  const user = await interaction.client.users
    .fetch(discordId)
    .catch(() => null);

  return (
    user?.globalName ??
    user?.username ??
    discordId
  );
}

function isAuthorized(interaction) {
  return interaction.user.id === '659339631564947456';
}

async function buildDisplayRecords(interaction, discordIds) {
  const records = [];
  for (const discordId of discordIds) {
    const displayName = await resolveDisplayName(interaction, discordId);
    records.push({ discordId, displayName: displayName || discordId });
  }
  return records;
}

async function getRecentCoopsOrRespond(interaction) {
  try {
    return listRecentCoops(DEFAULT_COOP_LOOKBACK);
  } catch (err) {
    console.error('Failed to list recent coops:', err);
    await interaction.editReply(
      createTextComponentMessage(' Could not read recent coops from the database.')
    );
    return null;
  }
}

async function getIgnDataOrRespond(interaction, coops) {
  try {
    return await collectIgnsFromCoops(coops);
  } catch (err) {
    console.error('Failed to collect IGN data from coops:', err);
    await interaction.editReply(
      createTextComponentMessage(' Error while fetching IGN data from coops.')
    );
    return null;
  }
}

async function ensureIgnNamesAvailable(interaction, ignNames, failedLookups) {
  if (ignNames.length) return true;

  const fallback = failedLookups.length
    ? `Unable to fetch contributors for ${failedLookups.length} coops.`
    : 'No IGN data returned from the recent coops.';

  await interaction.editReply(createTextComponentMessage(`ℹ ${fallback}`));
  return false;
}

async function ensureOpenAiConfigured(interaction) {
  if (process.env.OPENAI_API_KEY) return true;

  await interaction.editReply(
    createTextComponentMessage(' OPENAI_API_KEY is not configured; cannot compute embedding matches.')
  );
  return false;
}

async function produceMatchesAndRespond(interaction, { displayRecords, recentCoops, ignNames, failedLookups }) {
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const discordNames = displayRecords.map(record => record.displayName);
    const embDiscordRaw = await getEmbeddings(client, 'discord_missing', discordNames);
    const embIgnRaw = await getEmbeddings(client, 'coop_igns', ignNames);

    const embDiscord = embDiscordRaw.map(normalizeVector);
    const embIgn = embIgnRaw.map(normalizeVector);

    const lines = displayRecords.map((record, i) => {
      const perIgnScores = ignNames.map((ignName, j) => ({
        ign: ignName,
        score: computeScore(record.displayName, ignName, embDiscord[i], embIgn[j]),
      }));
      const sorted = perIgnScores.slice().sort((a, b) => b.score - a.score);
      return formatMatchLine(record, sorted);
    });

    const truncated = lines.length > MAX_OUTPUT_LINES;
    const bodyLines = truncated ? lines.slice(0, MAX_OUTPUT_LINES) : lines;

    const headerLine = `Checked ${displayRecords.length} members without IGNs against ${ignNames.length} unique IGNs from the latest ${recentCoops.length} coops.`;
    const noteLines = [];

    if (truncated) {
      noteLines.push(`additional members truncated (${lines.length - MAX_OUTPUT_LINES} more).`);
    }

    if (failedLookups.length) {
      const failedPreview = failedLookups.slice(0, FAILURE_LIST_PREVIEW).join(', ');
      const suffix = failedLookups.length > FAILURE_LIST_PREVIEW ? '…' : '';
      noteLines.push(`Failed to fetch contributors for ${failedLookups.length} coops: ${failedPreview}${suffix}`);
    }

    if (bodyLines.length === 0) {
      const messageParts = ['**Suggested Matches**', headerLine, '', 'No matches to display.'];
      if (noteLines.length) messageParts.push('', ...noteLines);
      await interaction.editReply(createTextComponentMessage(messageParts.join('\n')));
      return;
    }

    const headerParts = ['**Suggested Matches**', headerLine];
    if (noteLines.length) headerParts.push('', ...noteLines);
    await interaction.editReply(createTextComponentMessage(headerParts.join('\n')));

    const chunks = chunkContent(bodyLines, {
      wrap: { prefix: '```\n', suffix: '\n```' },
    });

    for (const chunk of chunks) {
      await interaction.followUp(createTextComponentMessage(chunk, { flags: 64 }));
    }
  } catch (err) {
    console.error('Failed to compute embedding matches:', err);
    await interaction.editReply(createTextComponentMessage(' Error while computing embedding matches.'));
  }
}


export const data = new SlashCommandBuilder()
  .setName('test')
  .setDescription('Suggest IGNs from recent coops for members missing one');

export async function execute(interaction) {
  if (!isAuthorized(interaction)) {
    await interaction.reply(
      createTextComponentMessage(' You are not authorized to perform this action.', { flags: 64 })
    );
    return;
  }

  await interaction.deferReply({ flags: 64 });

  const discordIds = listMembersWithoutIgn();
  if (discordIds.length === 0) {
    await interaction.editReply(
      createTextComponentMessage(' Everyone in the database already has an IGN linked.')
    );
    return;
  }

  const displayRecords = await buildDisplayRecords(interaction, discordIds);

  const recentCoops = await getRecentCoopsOrRespond(interaction);
  if (!recentCoops) return;

  const ignData = await getIgnDataOrRespond(interaction, recentCoops);
  if (!ignData) return;

  const { ignNames, failedLookups } = ignData;
  const hasIgnNames = await ensureIgnNamesAvailable(interaction, ignNames, failedLookups);
  if (!hasIgnNames) return;

  const openAiReady = await ensureOpenAiConfigured(interaction);
  if (!openAiReady) return;

  await produceMatchesAndRespond(interaction, {
    displayRecords,
    recentCoops,
    ignNames,
    failedLookups,
  });
}

export default { data, execute };
