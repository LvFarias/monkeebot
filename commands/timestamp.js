import { SlashCommandBuilder } from 'discord.js';
import { DateTime } from 'luxon';
import { createTextComponentMessage } from '../services/discord.js';

const LA_TIME_ZONE = 'America/Los_Angeles';
const MODE_CHOICES = [
    { name: 'Relative (now)', value: 'relative' },
    { name: 'EI Time', value: 'eitime' },
];
const FORMAT_CHOICES = [
    { name: 'Relative', value: 'R' },
    { name: 'Short time', value: 't' },
    { name: 'Long time', value: 'T' },
    { name: 'Short date', value: 'd' },
    { name: 'Long date', value: 'D' },
    { name: 'Long date + short time', value: 'f' },
    { name: 'Long date + weekday + short time', value: 'F' },
];
const DEFAULT_FORMAT = 'R';

export const data = new SlashCommandBuilder()
    .setName('timestamp')
    .setDescription('Generate Discord timestamps for EI time or relative offsets')
    .addStringOption(option =>
        option
            .setName('mode')
            .setDescription('Choose EI time or relative to now')
            .setRequired(true)
            .addChoices(...MODE_CHOICES)
    )
    .addStringOption(option =>
        option
            .setName('offset')
            .setDescription('Offset such as +0.5, +2:40, -0:30')
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName('format')
            .setDescription('Discord timestamp format token (defaults to relative)')
            .setRequired(false)
            .addChoices(...FORMAT_CHOICES)
    );

export async function execute(interaction) {
    const mode = interaction.options.getString('mode', true);
    const offsetInput = interaction.options.getString('offset', true).replaceAll(/\s+/g, '');
    const requestedFormat = interaction.options.getString('format') ?? DEFAULT_FORMAT;
    const formatChoice = FORMAT_CHOICES.find(choice => choice.value === requestedFormat)?.value ?? DEFAULT_FORMAT;

    try {
        const offsetSeconds = parseOffsetSeconds(offsetInput);
        const target = buildTargetDateTime(mode, offsetSeconds);
        const unixSeconds = Math.round(target.toSeconds());
        const header = mode === 'relative'
            ? `Relative ${offsetInput}`
            : `EI time ${offsetInput} `;
        const timestamp = `<t:${unixSeconds}:${formatChoice}>`;
        const codeBlock = `\u0060\u0060\u0060${timestamp}\u0060\u0060\u0060`
        const content = `${header}\n${timestamp}\n${codeBlock}`;

        await respond(interaction, content);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to create timestamp.';
        await respond(interaction, message, { flags: 64 });
    }
}

function parseOffsetSeconds(input) {
    if (!input) {
        throw new Error('Provide an offset such as +0.5, +2:40, or -0:30.');
    }

    const signChar = input[0];
    if (signChar !== '+' && signChar !== '-') {
        throw new Error('Offsets must start with + or -.');
    }

    const magnitude = input.slice(1);
    if (!magnitude) {
        throw new Error('Add a numeric offset after the sign (e.g., +1.5 or -0:45).');
    }

    if (magnitude.includes(':')) {
        const parts = magnitude.split(':');
        if (parts.length !== 2) {
            throw new Error('Use exactly one colon for HH:MM offsets (e.g., +2:30).');
        }

        const [hoursPart, minutesPart] = parts;
        if (!hoursPart || !minutesPart) {
            throw new Error('HH:MM offsets require both hours and minutes (e.g., +0:05).');
        }

        if (!/^\d+$/.test(hoursPart) || !/^\d+$/.test(minutesPart)) {
            throw new Error('Hours and minutes must be whole numbers in HH:MM offsets.');
        }

        const minutesValue = Number(minutesPart);
        if (minutesValue >= 60) {
            throw new Error('Minutes must be less than 60 (use +4:05 instead of +3:65).');
        }

        const totalMinutes = Number(hoursPart) * 60 + minutesValue;
        return applySign(totalMinutes * 60, signChar);
    }

    const decimalValue = Number(magnitude);
    if (Number.isNaN(decimalValue)) {
        throw new TypeError('Use decimal hours (e.g., +1.25) or HH:MM (e.g., -0:45).');
    }

    return applySign(Math.round(decimalValue * 3600), signChar);
}

function buildTargetDateTime(mode, offsetSeconds) {
    if (mode === 'relative') {
        return DateTime.utc().plus({ seconds: offsetSeconds });
    }

    if (mode === 'eitime') {
        const laNow = DateTime.now().setZone(LA_TIME_ZONE);
        const base = laNow.set({ hour: 9, minute: 0, second: 0, millisecond: 0 });
        return base.plus({ seconds: offsetSeconds });
    }

    throw new TypeError('Mode must be either relative or eitime.');
}

async function respond(interaction, content, options = {}) {
    const payload = createTextComponentMessage(content, options);
    if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
    } else {
        await interaction.reply(payload);
    }
}

function applySign(value, signChar) {
    const multiplier = signChar === '-' ? -1 : 1;
    return value * multiplier;
}
