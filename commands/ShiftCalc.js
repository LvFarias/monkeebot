import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { createTextComponentMessage } from '../services/discord.js';


const suffixList = [
    { suffix: 'o', value: 1e27 },
    { suffix: 'S', value: 1e24 },
    { suffix: 's', value: 1e21 },
    { suffix: 'Q', value: 1e18 },
    { suffix: 'q', value: 1e15 },
    { suffix: 'T', value: 1e12 },
    { suffix: 'b', value: 1e9 },
    { suffix: 'm', value: 1e6 },
    { suffix: 'k', value: 1e3 }
];

const suffixMap = Object.fromEntries(suffixList.map(x => [x.suffix, x.value]));


// Parse input like "100s" or "80%" or "50" (shifts)
function parseInput(input) {
    input = input.trim();


    // Percentage
    if (input.endsWith('%')) {
        const value = Number.parseFloat(input.slice(0, -1));
        if (Number.isNaN(value)) throw new Error('Invalid percentage');
        return { type: 'percent', value };
    }

    // Plain number check (shift count if 1–1000)
    if (/^\d+$/.test(input)) {
        const value = Number.parseInt(input, 10);
        if (value >= 1 && value <= 1000) {
            return { type: 'shifts', value };
        }
    }


    // Number with suffix or plain SE number
    const suffix = input.slice(-1);
    const multiplier = suffixMap[suffix] || 1;
    const numericPart = multiplier === 1 ? input : input.slice(0, -1);
    const number = Number.parseFloat(numericPart);
    if (Number.isNaN(number)) throw new Error('Invalid number');
    return { type: 'number', value: number * multiplier };
}


// Convert number back to suffix notation
function numberToSuffix(num) {
    for (const { suffix, value } of suffixList) {
        if (num >= value) {
            const shortNum = (num / value).toFixed(2).replace(/\.00$/, '');
            return `${shortNum}${suffix}`;
        }
    }
    return num.toString();
}


// Shared calculation shift step
function calculateStep(E, N) {
    const B = E * (0.02 * Math.pow(N / 120, 3) + 0.0001);
    const cost = 1e11 + 0.6 * B + Math.pow(0.4 * B, 0.9);
    return { nextE: E - cost, cost };
}


// Calculate SE reduction until target SE or percent
function calculateSE(initialSE, target, startingshift = 0) {
    let E = initialSE;
    let N = startingshift;
    let prevE = E;
    let prevN = N;
    let lastCost = 0;

    const isshiftTarget = target.type === 'shifts';
    const targetValue = target.type === 'percent'
        ? initialSE * (target.value / 100)
        : target.value;

    while (true) {
        // Stop conditions
        if (isshiftTarget && N >= startingshift + target.value) break;
        if (!isshiftTarget && E <= targetValue) break;
        if (N > 1e6) break;

        const { nextE, cost } = calculateStep(E, N);

        // Prevent overshooting into negative
        if (nextE < 0) break;

        prevE = E;
        prevN = N;
        E = nextE;
        lastCost = cost;
        N++;
    }

    return { finalSE: E, prevSE: prevE, shifts: N, prevshifts: prevN, lastCost };
}

export const data = new SlashCommandBuilder()
    .setName('shiftcalc')
    .setDescription('Calculate SE target and required shifts')
    .setContexts([0, 1, 2])
    .addStringOption(option =>
        option.setName('initial')
            .setDescription('Starting SE (e.g., 100s)')
            .setRequired(true)
    )
    .addStringOption(option =>
        option.setName('target')
            .setDescription('Target SE (number with suffix, %, or shifts 1-1000)')
            .setRequired(true)
    )
    .addIntegerOption(option =>
        option.setName('startingshift')
            .setDescription('shift count to start from (e.g., 100)')
            .setRequired(false)
    );

export async function execute(interaction) {
    try {
        const initialInput = interaction.options.getString('initial');
        const targetInput = interaction.options.getString('target');
        const startingshift = interaction.options.getInteger('startingshift') || 0;

        const initial = parseInput(initialInput);
        const target = parseInput(targetInput);

        if (initial.type !== 'number') {
            return interaction.reply(
                createTextComponentMessage('Initial SE must be a number, not a percentage.', { flags: 64 })
            );
        }

        const result = calculateSE(initial.value, target, startingshift);

        // Format target label
        const targetLabel = target.type === 'shifts'
            ? `${target.value} shifts`
            : targetInput;

        const fields = [
            { name: 'Initial SE', value: numberToSuffix(initial.value), inline: true },
            { name: 'Target', value: targetLabel, inline: true },
            { name: 'Final SE', value: numberToSuffix(result.finalSE), inline: true },
            { name: 'Number of shifts', value: `${result.shifts}`, inline: true },
            { name: 'Last shift Cost', value: numberToSuffix(result.lastCost), inline: true },
        ];

        if (result.prevshifts !== result.shifts && result.prevSE > 0) {
            fields.push({
                name: `SE before last shift (${result.prevshifts} shifts)`,
                value: numberToSuffix(result.prevSE),
                inline: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('SE Calculation')
            .addFields(fields);

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        await interaction.reply(createTextComponentMessage(`Error: ${error.message}`, { flags: 64 }));
    }
}
