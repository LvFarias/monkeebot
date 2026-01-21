import { vi } from 'vitest';

export function createOptions({
  strings = {},
  booleans = {},
  integers = {},
  subcommand = null,
  focused = '',
  focusedOptionName = null,
} = {}) {
  return {
    getString(name) {
      return Object.hasOwn(strings, name) ? strings[name] : null;
    },
    getBoolean(name) {
      return Object.hasOwn(booleans, name) ? booleans[name] : null;
    },
    getInteger(name) {
      return Object.hasOwn(integers, name) ? integers[name] : null;
    },
    getSubcommand() {
      return subcommand;
    },
    getFocused(withDetails) {
      if (withDetails) {
        return { name: focusedOptionName ?? '', value: focused };
      }
      return focused;
    },
  };
}

export function createInteraction({
  options = createOptions(),
  userId = 'user-id',
  channelSend = null,
  guildMembers = null,
  clientUsers = null,
} = {}) {
  const interaction = {
    user: { id: userId },
    options,
    deferred: false,
    replied: false,
  };

  interaction.reply = vi.fn(async () => {
    interaction.replied = true;
  });
  interaction.editReply = vi.fn(async () => {});
  interaction.followUp = vi.fn(async () => {});
  interaction.deferReply = vi.fn(async () => {
    interaction.deferred = true;
  });
  interaction.respond = vi.fn(async () => {});
  interaction.fetchReply = vi.fn(async () => ({
    id: 'reply-id',
    channelId: 'channel-id',
    guildId: 'guild-id',
    channel: interaction.channel ?? null,
    flags: { has: () => false },
  }));

  interaction.channel = channelSend
    ? { send: channelSend }
    : { send: vi.fn(async () => {}) };

  interaction.guild = guildMembers
    ? {
        members: {
          cache: new Map(guildMembers),
          fetch: vi.fn(async (id) => guildMembers.get(id) ?? null),
        },
      }
    : null;

  interaction.client = {
    users: {
      fetch: vi.fn(async (id) => clientUsers?.get(id) ?? null),
    },
  };

  return interaction;
}
