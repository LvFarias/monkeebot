import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { fetchPastCoops } from '../services/coopService.js';
import { listSeasons } from '../services/seasonService.js';
import { chunkContent } from '../services/discord.js';

export const data = new SlashCommandBuilder()
    .setName('pastcoops')
    .setDescription('List past coop identifiers and counts (sorted)')
    .addBooleanOption(option =>
        option.setName('push_only')
            .setDescription('Only include coops that were marked push')
            .setRequired(false)
    )
    .addStringOption(option =>
        option.setName('season')
            .setDescription('Filter by season (e.g. fall_2025)')
            .setRequired(false)
            .setAutocomplete(true)
    );

function formatRows(rows) {
    const lines = rows.map(row => `${row.cnt} ${row.coop}`);
    const totalCoops = rows.reduce((sum, row) => sum + (row.cnt || 0), 0);
    const totalChars = rows.reduce((sum, row) => sum + (row.cnt || 0) * String(row.coop).length, 0);
    return { lines, totalCoops, totalChars };
}

function processingTimeText(start) {
    const elapsedMs = Date.now() - start;
    const minutes = Math.floor(elapsedMs / 60000);
    const seconds = Math.floor((elapsedMs % 60000) / 1000);
    return `Total !!pc time: ${minutes}m ${seconds}s`;
}

async function replyNoRows(interaction, season) {
    const seasonSuffix = season ? ' for season ' + season : '';
    await interaction.reply('No coops recorded yet' + seasonSuffix + '.');
}

async function sendAdditionalChunks(interaction, chunks) {
    for (const chunk of chunks) {
        await interaction.followUp({ content: chunk });
    }
}

async function sendPagedResponse(interaction, chunks) {
    if (chunks.length === 0) {
        return { replyMessage: null, channel: interaction.channel ?? null };
    }

    try {
        await interaction.reply({ content: chunks[0], withResponse: true });
        const replyMessage = await interaction.fetchReply().catch(() => null);
        await sendAdditionalChunks(interaction, chunks.slice(1));
        const channel = replyMessage?.channel ?? interaction.channel ?? null;
        return { replyMessage, channel };
    } catch (err) {
        console.warn('Failed to send pastcoops reply with response, retrying without it:', err);
        await interaction.reply(chunks[0]);
        const replyMessage = await interaction.fetchReply().catch(() => null);
        await sendAdditionalChunks(interaction, chunks.slice(1));
        const channel = replyMessage?.channel ?? interaction.channel ?? null;
        return { replyMessage, channel };
    }
}

function buildBlameText(replyMessage) {
    if (!replyMessage?.id) {
        return 'Who to blame for this: (link not available)';
    }

    const guildPart = replyMessage.guildId ? replyMessage.guildId : '@me';
    const link = `https://discord.com/channels/${guildPart}/${replyMessage.channelId}/${replyMessage.id}`;
    return `Who to blame for this: ${link}`;
}

function isMissingAccessError(err) {
    if (!err) return false;
    const code = err.code ?? err?.rawError?.code;
    return code === 50001 || code === 50013;
}

function makeFollowUpOptions(content, isEphemeral) {
    return isEphemeral ? { content, flags: 64 } : { content };
}

async function sendFooter(interaction, channel, replyMessage, totalsText, charsText, start) {
    const blameText = buildBlameText(replyMessage);
    const processingText = processingTimeText(start);
    const isEphemeral = replyMessage?.flags?.has?.(MessageFlags.Ephemeral) ?? false;

    try {
        if (channel && typeof channel.send === 'function' && !isEphemeral) {
            await channel.send(`${totalsText}\n${charsText}`);
            await channel.send(processingText);
            await channel.send(blameText);
            return;
        }

        await interaction.followUp(makeFollowUpOptions(`${totalsText}\n${charsText}`, isEphemeral));
        await interaction.followUp(makeFollowUpOptions(processingText, isEphemeral));
        await interaction.followUp(makeFollowUpOptions(blameText, isEphemeral));
    } catch (err) {
        if (!isMissingAccessError(err)) {
            console.error('Failed to send footer messages for pastcoops:', err);
        }
        try {
            await interaction.followUp(makeFollowUpOptions(`${totalsText}\n${charsText}\n${blameText}`, true));
        } catch (err) {
            if (!isMissingAccessError(err)) {
                console.warn('Failed to send fallback footer for pastcoops:', err);
            }
        }
    }
}

export async function execute(interaction) {
    const start = Date.now();
    const pushOnly = interaction.options.getBoolean('push_only') ?? false;
    const season = interaction.options.getString('season') || null;

    const rows = fetchPastCoops({ pushOnly, season });

    if (!rows || rows.length === 0) {
        await replyNoRows(interaction, season);
        return;
    }

    const { lines, totalCoops, totalChars } = formatRows(rows);
    const chunks = chunkContent(lines, { wrap: { prefix: '```\n', suffix: '\n```' } });
    const { replyMessage, channel } = await sendPagedResponse(interaction, chunks);

    const totalsText = `Total coops: ${totalCoops}`;
    const charsText = `Total characters: ${totalChars}`;

    await sendFooter(interaction, channel, replyMessage, totalsText, charsText, start);
}

export async function autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const allSeasons = listSeasons();
    const filtered = allSeasons
        .filter(season => season.toLowerCase().includes(focused))
        .slice(0, 4);
    await interaction.respond(filtered.map(season => ({ name: season, value: season })));
}

export default { data, execute, autocomplete };