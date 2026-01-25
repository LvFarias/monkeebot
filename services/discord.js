import { MessageFlags, TextDisplayBuilder } from 'discord.js';

export function extractDiscordId(value) {
  if (!value) return null;
  const regex = /\d{17,20}/;
  const match = regex.exec(String(value));
  return match ? match[0] : null;
}
export function extractDiscordIds(input) {
  if (!input) return [];
  const regex = /\d{17,20}/g;
  const text = String(input);
  const matches = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    matches.push(match[0]);
  }

  return Array.from(new Set(matches.map(id => id.trim())));
}

export function isValidHttpUrl(candidate) {
  if (!candidate) return false;
  try {
    const url = new URL(String(candidate).trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (err) {
    console.error('Invalid URL:', err);
    return false;
  }
}
 
export const MAX_DISCORD_MESSAGE_LENGTH = 2000;
export const MAX_DISCORD_COMPONENT_LENGTH = 4000;

export function createTextComponentMessage(content, options = {}) {
  const {
    components = [],
    allowedMentions,
    flags,
    ...rest
  } = options;

  const textContent = content == null ? ' ' : String(content);
  const textDisplay = new TextDisplayBuilder().setContent(textContent);
  const mentionDefaults = allowedMentions ?? { parse: [], users: [], roles: [] };

  return {
    ...rest,
    allowedMentions: mentionDefaults,
    components: [textDisplay, ...components],
    flags: (flags ?? 0) | MessageFlags.IsComponentsV2,
  };
}
 
export function chunkContent(input, options = {}) {
  const { maxLength = MAX_DISCORD_MESSAGE_LENGTH, wrap, separator } = options;
  const prefix = wrap?.prefix ?? '';
  const suffix = wrap?.suffix ?? '';
  const effectiveLimit = maxLength - prefix.length - suffix.length;

  if (effectiveLimit <= 0) {
    throw new Error('Chunk wrap leaves no room for content');
  }

  if (Array.isArray(input)) {
    const lines = input.map(value => (value == null ? '' : String(value)));
    return chunkArrayContent(lines, {
      joiner: separator ?? '\n',
      prefix,
      suffix,
      effectiveLimit,
    });
  }

  return chunkScalarContent(input, { prefix, suffix, effectiveLimit });
}

export function buildProgressBar({ completed, total, width = 20 }) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const ratio = Math.min(1, Math.max(0, (Number(completed) || 0) / safeTotal));
  const filled = Math.round(ratio * width);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}`;
}

export function createDiscordProgressReporter(
  interaction,
  {
    intervalMs = 2000,
    prefix = 'Simulations',
    width = 20,
  } = {}
) {
  let lastUpdate = 0;

  return async ({ completed = 0, total = 0, active = 0, queued = 0 } = {}) => {
    const now = Date.now();
    const isFinal = total > 0 && completed >= total;
    if (!isFinal && now - lastUpdate < intervalMs) return;
    lastUpdate = now;

    const bar = buildProgressBar({ completed, total, width });
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const content = `${prefix}: [${bar}] ${percent}% (${completed}/${total}) | active: ${active} | queued: ${queued}`;

    if (typeof interaction?.editReply === 'function') {
      await interaction.editReply({ content });
      return;
    }

    if (typeof interaction?.reply === 'function') {
      await interaction.reply({ content });
    }
  };
}

export function startDeferredReplyHeartbeat(
  interaction,
  {
    intervalMs = 2000,
    prefix = 'Working',
  } = {}
) {
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const content = `${prefix}... (${elapsedSeconds}s)`;
    if (typeof interaction?.editReply === 'function') {
      Promise.resolve(interaction.editReply({ content })).catch(() => {});
    }
  }, intervalMs);

  return () => clearInterval(timer);
}

function chunkArrayContent(lines, { joiner, prefix, suffix, effectiveLimit }) {
  const chunks = [];
  let currentLines = [];
  let currentLength = 0;

  const wrapSegment = segment => prefix + segment + suffix;

  const flush = () => {
    if (!currentLines.length) return;
    const body = currentLines.join(joiner);
    if (body === '' && !prefix && !suffix) {
      chunks.push(' ');
    } else {
      chunks.push(wrapSegment(body));
    }
    currentLines = [];
    currentLength = 0;
  };

  const pushLongLine = line => {
    if (!line.length && !prefix && !suffix) {
      const addition = currentLines.length ? joiner.length : 0;
      if (currentLines.length && currentLength + addition > effectiveLimit) {
        flush();
      }
      currentLines.push('');
      currentLength += addition;
      return;
    }

    for (let index = 0; index < line.length; index += effectiveLimit) {
      const segment = line.slice(index, index + effectiveLimit);
      chunks.push(wrapSegment(segment));
    }
  };

  for (const line of lines) {
    if (line.length > effectiveLimit) {
      flush();
      pushLongLine(line);
      continue;
    }

    const additionLength = line.length + (currentLines.length ? joiner.length : 0);
    if (currentLines.length && currentLength + additionLength > effectiveLimit) {
      flush();
    }

    currentLines.push(line);
    currentLength += additionLength;
  }

  flush();

  if (!chunks.length) {
    const placeholder = prefix + suffix;
    chunks.push(placeholder || ' ');
  }

  return chunks;
}

function chunkScalarContent(input, { prefix, suffix, effectiveLimit }) {
  const text = input == null ? '' : String(input);
  if (!text) {
    const placeholder = prefix + suffix;
    return [placeholder || ' '];
  }

  const chunks = [];
  for (let index = 0; index < text.length; index += effectiveLimit) {
    const segment = text.slice(index, index + effectiveLimit);
    chunks.push(prefix + segment + suffix);
  }
  return chunks;
}
