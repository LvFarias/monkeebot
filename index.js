import { Client, GatewayIntentBits, Collection, Events, REST, Routes, Partials, ApplicationCommandType, ApplicationCommandOptionType } from 'discord.js';
import { getMonkeeReply } from './utils/openai.js';
import { isMonkeeEnabled } from './commands/monkee.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ], 
  partials: [Partials.Channel],
});
client.commands = new Collection();
let monkeeMissingKeyNotified = false;

// Load command files
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const commandModule = await import(`./commands/${file}`);
  const command = commandModule.default ?? {
    data: commandModule.data,
    execute: commandModule.execute,
    autocomplete: commandModule.autocomplete,
    handleComponentInteraction: commandModule.handleComponentInteraction,
    handleModalSubmit: commandModule.handleModalSubmit,
  };
  client.commands.set(command.data.name, command);
}
client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.rest.post(Routes.applicationCommands(client.user.id), {
        body: {
            name: "transcript",
            type: ApplicationCommandType.Message,
            integration_types: [0, 1],
        }
      });
});

function formatCommandOptions(optionData) {
  if (!Array.isArray(optionData) || optionData.length === 0) {
    return '';
  }

  const parts = [];

  for (const option of optionData) {
    if (
      (option.type === ApplicationCommandOptionType.Subcommand ||
        option.type === ApplicationCommandOptionType.SubcommandGroup) &&
      Array.isArray(option.options)
    ) {
      const nested = formatCommandOptions(option.options);
      if (nested) {
        parts.push(nested);
      }
    } else if (Object.hasOwn(option, 'value')) {
      parts.push(`${option.name}=${String(option.value)}`);
    }
  }

  return parts.filter(Boolean).join(', ');
}

client.on(Events.InteractionCreate, async interaction => {
  if (await handleComponentInteraction(interaction, client)) return;
  if (await handleModalInteraction(interaction, client)) return;
  if (await handleAutocompleteInteraction(interaction, client)) return;
  await handleChatInputInteraction(interaction, client);
});

async function handleComponentInteraction(interaction, clientInstance) {
  if (!interaction.isMessageComponent()) return false;
  const commandName = interaction.customId?.split(':')?.[0];
  const command = clientInstance.commands.get(commandName);
  if (command && typeof command.handleComponentInteraction === 'function') {
    try {
      const handled = await command.handleComponentInteraction(interaction);
      return handled === true;
    } catch (error) {
      console.error('Component interaction error:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: 'There was an error handling this interaction.',
          flags: 64,
        });
      } else {
        await interaction.reply({
          content: 'There was an error handling this interaction.',
          flags: 64,
        });
      }
    }
  }
  return false;
}

async function handleModalInteraction(interaction, clientInstance) {
  if (!interaction.isModalSubmit()) return false;
  const commandName = interaction.customId?.split(':')?.[0];
  const command = clientInstance.commands.get(commandName);
  if (command && typeof command.handleModalSubmit === 'function') {
    try {
      await command.handleModalSubmit(interaction);
    } catch (error) {
      console.error('Modal submit error:', error);
      await interaction.reply({
        content: 'There was an error handling this form.',
        flags: 64,
      });
    }
  }
  return true;
}

async function handleAutocompleteInteraction(interaction, clientInstance) {
  if (!interaction.isAutocomplete()) return false;
  const command = clientInstance.commands.get(interaction.commandName);
  if (command && typeof command.autocomplete === 'function') {
    try {
      await command.autocomplete(interaction);
    } catch (error) {
      console.error('Autocomplete error:', error);
    }
  }
  return true;
}

async function handleChatInputInteraction(interaction, clientInstance) {
  if (!interaction.isChatInputCommand()) return;

  const command = clientInstance.commands.get(interaction.commandName);
  if (!command) return;

  try {
    const user = interaction.user ?? { username: 'unknown', id: 'unknown' };
    const userTag = user.tag ?? user.username;
    const userId = user.id;

    const options = interaction.options?.data ?? [];
    const subcommandGroup = options.find(opt => opt.type === 2)?.name ?? null;
    const subcommand = options.find(opt => opt.type === 1)?.name ?? null;

    const commandPath = [interaction.commandName, subcommandGroup, subcommand]
      .filter(Boolean)
      .join(' ');

    const optionsSummary = formatCommandOptions(options);

    console.log(
      `Command "${commandPath}" invoked by ${userTag} (${userId})${
        optionsSummary ? ` with options: ${optionsSummary}` : ''
      }`
    );
  } catch (err) {
    console.error('Failed to log command invocation:', err);
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: 'There was an error executing this command.',
      flags: 64,
    });
  }
}



async function handleMonkeeMessage(client, message) {
  if (!isMonkeeEnabled()) return;

  if (!process.env.OPENAI_API_KEY) {
    if (!monkeeMissingKeyNotified) {
      await message.reply('Monkee AI is not configured: OPENAI_API_KEY is missing.');
      monkeeMissingKeyNotified = true;
    }
    return;
  }

  try {
    const fetchedMessages = await message.channel.messages.fetch({ limit: 10 });
    const relevantMessages = fetchedMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const messages = relevantMessages.map(msg => ({
      role: msg.author.id === client.user.id ? 'assistant' : 'user',
      content: msg.author.id === client.user.id
        ? msg.content
        : `${msg.author.username}: ${msg.content}`,
    }));

    const lastMessage = messages.at(-1);
    if (!lastMessage?.content.includes(message.content)) {
      messages.push({
        role: 'user',
        content: `${message.author.username}: ${message.content}`
      });
    }

    const reply = await getMonkeeReply(messages);
    if (reply && reply !== 'null') {
      await message.reply(reply);
    }
  } catch (err) {
    console.error('Error from Monkee Bot:', err);
  }
}



await client.login(process.env.TOKEN);

const commands = [];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'))) {
  const commandModule = await import(`./commands/${file}`);
  const command = { data: commandModule.data, execute: commandModule.execute };
  if ('data' in command && 'execute' in command) {
    commands.push(
      commandModule.data
        .setIntegrationTypes([0, 1])
        .setContexts([0, 1, 2])
        .toJSON()
    );
  } else {
    console.warn(`[WARNING] The command at ./commands/${file} is missing a required "data" or "execute" property.`);
    console.log(file, '=>', command);
  }
}

commands.push({
  name: 'transcript',
  type: ApplicationCommandType.Message,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
});

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

try {
  console.log('Registering global slash commands...');
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
  console.log('Commands registered globally.');
} catch (error) {
  console.error(error);
}