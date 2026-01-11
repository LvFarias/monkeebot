import { SlashCommandBuilder } from 'discord.js';
import { createTextComponentMessage } from '../services/discord.js';
import { DateTime } from 'luxon';

const LA_ZONE = 'America/Los_Angeles';
const BASE_HOUR = 9;
const CONTRACT_DROP_WEEKDAYS = new Set([1, 3, 5]);

const offsetDefinitions = [
    { offset: 0 },
    { offset: 1 },
    { offset: 2 },
    { offset: 3 },
    { offset: 4 },
    { offset: 5 },
    { offset: 6 },
    { offset: 7 },
    { offset: 8 },
    { offset: 9 },
    { offset: 10 },
    { offset: 11 },
    { offset: 12 },
    { offset: -11 },
    { offset: -10 },
    { offset: -9 },
    { offset: -8 },
    { offset: -7 },
    { offset: -6 },
    { offset: -5 },
    { offset: -4 },
    { offset: -3 },
    { offset: -2 },
    { offset: -1 }
];

const commandChoices = [
    {
        value: 'contract-drop',
        label: 'Contract drop'
    },
    ...offsetDefinitions.map(({ offset }) => {
        const sign = offset >= 0 ? '+' : '';
        return {
            value: `offset${sign}${offset}`,
            label: `${sign}${offset}`
        };
    })
].map((choice, index) => ({
    ...choice,
    name: `${index + 1}. ${choice.label}`
}));

function nextDailyTime(now, hour) {
    let candidate = now.set({ hour, minute: 0, second: 0, millisecond: 0 });

    if (candidate <= now) {
        candidate = candidate.plus({ days: 1 }).set({ hour, minute: 0, second: 0, millisecond: 0 });
    }

    return candidate;
}

function nextContractDrop(now) {
    for (let i = 0; i < 8; i += 1) {
        const candidateDay = now.plus({ days: i });
        if (!CONTRACT_DROP_WEEKDAYS.has(candidateDay.weekday)) {
            continue;
        }

        const candidate = candidateDay.set({ hour: BASE_HOUR, minute: 0, second: 0, millisecond: 0 });
        if (candidate > now) {
            return candidate;
        }
    }

    const fallback = now.plus({ weeks: 1 });
    return fallback.set({ weekday: 1, hour: BASE_HOUR, minute: 0, second: 0, millisecond: 0 });
}

function getNextTimestamp(selection, now) {
    if (selection === 'contract-drop') {
        return nextContractDrop(now);
    }

    const match = commandChoices.find(choice => choice.value === selection);
    if (!match) {
        return null;
    }

    const signedOffset = Number.parseInt(match.value.replace('offset', ''), 10);
    if (Number.isNaN(signedOffset)) {
        return null;
    }

    const hour = ((BASE_HOUR + signedOffset) % 24 + 24) % 24;
    return nextDailyTime(now, hour);
}

export const data = new SlashCommandBuilder()
    .setName('whenthefuckis')
    .setDescription('Figure out when the next damn contract thing happens.')
    .setContexts([0, 1, 2])
    .addStringOption(option => {
        const choices = commandChoices.map(choice => ({ name: choice.name, value: choice.value }));
        return option
            .setName('target')
            .setDescription('Pick the thing you actually care about')
            .setRequired(true)
            .addChoices(...choices);
    });

export async function execute(interaction) {
    const selection = interaction.options.getString('target');
    const now = DateTime.now().setZone(LA_ZONE);

    const nextTime = getNextTimestamp(selection, now);

    if (!nextTime) {
        return interaction.reply(
            createTextComponentMessage('I have no clue when that is. Try again.', { flags: 64 })
        );
    }

    const choice = commandChoices.find(option => option.value === selection);


        const thresholdSeconds = 60;

        let isRightNow = false;

        if (selection === 'contract-drop') {
            const possibleTimes = [];

            if (CONTRACT_DROP_WEEKDAYS.has(now.weekday)) {
                possibleTimes.push(now.set({ hour: BASE_HOUR, minute: 0, second: 0, millisecond: 0 }));
            }

            possibleTimes.push(nextTime);

            for (let i = 1; i <= 7; i += 1) {
                const candidateDay = now.minus({ days: i });
                if (!CONTRACT_DROP_WEEKDAYS.has(candidateDay.weekday)) {
                    continue;
                }

                possibleTimes.push(candidateDay.set({ hour: BASE_HOUR, minute: 0, second: 0, millisecond: 0 }));
                break;
            }

            isRightNow = possibleTimes.some(time => Math.abs(time.diff(now, 'seconds').seconds) < thresholdSeconds);
        } else {
            const signedOffset = Number.parseInt(selection.replace('offset', ''), 10);
            if (!Number.isNaN(signedOffset)) {
                const targetHour = ((BASE_HOUR + signedOffset) % 24 + 24) % 24;
                const baseToday = now.set({ hour: targetHour, minute: 0, second: 0, millisecond: 0 });
                const possibleTimes = [
                    baseToday,
                    baseToday.plus({ days: 1 }),
                    baseToday.minus({ days: 1 })
                ];

                isRightNow = possibleTimes.some(time => Math.abs(time.diff(now, 'seconds').seconds) < thresholdSeconds);
            }
        }

        if (isRightNow) {
            await interaction.reply(createTextComponentMessage(`${choice.label} is right the fuck now`));
            return;
        }

        const epochSeconds = Math.floor(nextTime.toSeconds());
        await interaction.reply(
            createTextComponentMessage(`${choice.label} is at\n<t:${epochSeconds}>`)
        );
}
