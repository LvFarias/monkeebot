import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { REFERENCE_HOUR_UTC } from '../utils/eggStandartTime.js';

export const WEEK_DAYS = [
	{ label: 'Monday', value: '1' },
	{ label: 'Tuesday', value: '2' },
	{ label: 'Wednesday', value: '3' },
	{ label: 'Thursday', value: '4' },
	{ label: 'Friday', value: '5' },
	{ label: 'Saturday', value: '6' },
	{ label: 'Sunday', value: '7' },
];

export const DEFLECTOR_CHOICES = [
	{ name: 'T4 Common (T4C)', value: 'T4C' },
	{ name: 'T4 Rare (T4R)', value: 'T4R' },
	{ name: 'T4 Epic (T4E)', value: 'T4E' },
	{ name: 'T4 Leggy (T4L)', value: 'T4L' },
];

export const MAX_EPIC_DEFLECTORS = new Map([
    [1, 0],
    [2, 0],
    [3, 1],
    [4, 3],
    [5, 3],
    [6, 4],
    [7, 5],
    [8, 6],
    [9, 8],
    [10, 5],
    [11, 10],
    [12, 11],
]);

function getHourOptions() {
	const hours = [];
	// From -4 to +10 relative to +0
	for (let i = -4; i <= 10; i++) {
		const estHour = i;
		const utcHour = (REFERENCE_HOUR_UTC + estHour + 24) % 24;
		hours.push({
			value: `${utcHour}`,
			label: `${estHour > 0 ? '+' : ''}${estHour}`,
			description: `Time: ${utcHour.toString().padStart(2, '0')}:00 UTC`,
		});
	}
	return hours.slice(0, 25);
}

export async function createScheduleComponents(selectedDay, schedule) {
	const dayButtons = WEEK_DAYS.map((day) =>
		new ButtonBuilder()
			.setCustomId(`day_${day.value}`)
			.setLabel(day.label)
			.setStyle(
				parseInt(day.value, 10) === selectedDay
					? ButtonStyle.Primary
					: ButtonStyle.Secondary,
			),
	);

	// An ActionRow can only hold 5 buttons, so split them into two rows.
	const dayButtonRow1 = new ActionRowBuilder().addComponents(
		dayButtons.slice(0, 5),
	);
	const dayButtonRow2 = new ActionRowBuilder().addComponents(
		dayButtons.slice(5),
	);

	const hourOptions = getHourOptions();
	const savedHoursForDay = schedule.get(selectedDay) || new Set();

	const hourSelect = new ActionRowBuilder().addComponents(
		new StringSelectMenuBuilder()
			.setCustomId('hour_select')
			.setPlaceholder('Select your available hours for the chosen day')
			.setMinValues(0)
			.setMaxValues(hourOptions.length)
			.addOptions(
				hourOptions.map((opt) => ({
					...opt,
					default: savedHoursForDay.has(parseInt(opt.value, 10)),
				})),
			),
	);
	const finishButton = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId('finish_schedule')
			.setLabel('Finish')
			.setStyle(ButtonStyle.Success),
	);

	return [dayButtonRow1, dayButtonRow2, hourSelect, finishButton];
}

export function groupPlayersByHour(players) {
    const groups = new Map();
    for (const player of players) {
		for (const hour of player.hours) {
			if (!groups.has(hour)) {
				groups.set(hour, []);
			}
			groups.get(hour).push(player);
		}
    }
    return groups;
}

export default {
	DEFLECTOR_CHOICES,
	WEEK_DAYS,
	MAX_EPIC_DEFLECTORS,
	createScheduleComponents,
	groupPlayersByHour,
};
