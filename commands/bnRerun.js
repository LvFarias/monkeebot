import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import {
	groupPlayersByHour,
	MAX_EPIC_DEFLECTORS,
	WEEK_DAYS,
} from '../services/bnPlayerService.js';
import { fetchActiveContracts } from '../services/contractService.js';
import { getContractById } from '../utils/database/contractsRepository.js';
import { formatHourRanges } from '../utils/eggStandartTime.js';
import { createTextComponentMessage } from '../services/discord.js';
import { getMemberRecord, listAllMembers } from '../utils/database/membersRepository.js';
import { findPlayersForRerun } from '../services/googleSheetService.js';

export const data = new SlashCommandBuilder()
	.setName('bn-rerun')
	.setDescription('Find available players for a BN rerun.')
	.addStringOption((option) =>
		option
			.setName('contract')
			.setDescription('The contract you want to run.')
			.setRequired(true)
			.setAutocomplete(true),
	)
	.addStringOption((option) =>
		option
			.setName('day')
			.setDescription('The day of the week for the rerun.')
			.setRequired(true)
			.addChoices(
				...WEEK_DAYS.map((day) => ({
					name: day.label,
					value: day.value,
				})),
			),
	)
	.addBooleanOption((option) =>
		option
			.setName('ultra_only')
			.setDescription(
				'Filter by only Ultra users',
			)
			.setRequired(false)
	)
	.addStringOption((option) =>
		option
			.setName('pushed')
			.setDescription(
				'Select a player to be pushed and optimize for push-run.',
			)
			.setRequired(false)
			.setAutocomplete(true),
	)
	.addStringOption((option) =>
		option
			.setName('hours')
			.setDescription(
				'Optional list of game hours to filter (e.g., +0,-2,+4).',
			)
			.setRequired(false),
	);

export async function execute(interaction) {
	await interaction.deferReply();

	const contractId = interaction.options.getString('contract', true);
	const day = interaction.options.getString('day', true);
	const pushedUserId = interaction.options.getString('pushed');
	const hoursInput = interaction.options.getString('hours') || '';
	const isUltraOnly = interaction.options.getBoolean('ultra_only') || false;
	const hours = hoursInput.split(',').map((h) => parseInt(h.trim(), 10)).filter((h) => !isNaN(h));
	const isPush = !!pushedUserId;

	const requiredUser = getMemberRecord(pushedUserId || interaction.user.id);
	if (!requiredUser) {
		await interaction.editReply(
			createTextComponentMessage(
				`You isn't a monkee member, please ask to a MamaBird to add you`
			),
		);
		return;
	}

	const contract = await getContractById(contractId);
	if (!contract) {
		await interaction.editReply(
			createTextComponentMessage(
				`Could not find contract info for \`${contract.name}\`. Make sure it's a valid contract.`,
			),
		);
		return;
	}

	const players = await findPlayersForRerun(contractId, day, hours, isUltraOnly);

	if (players.length === 0) {
		const dayLabel =
			WEEK_DAYS.find((d) => d.value === day)?.label || `Day ${day}`;
		await interaction.editReply(
			createTextComponentMessage(
				`No players found for \`${contractId}\` on ${dayLabel}.`,
			),
		);
		return;
	}

	const playersByHour = groupPlayersByHour(players);

	let availableSlots = [];
	for (const [hour, hourPlayers] of playersByHour.entries()) {
		if (!hourPlayers.some((p) => p.sheet_tab == requiredUser.sheet_tab)) {
			continue;
		}

		let finalPlayers = hourPlayers;
		const requiredPlayer = hourPlayers.find(
			(p) => p.sheet_tab == requiredUser.sheet_tab,
		);
		const otherPlayers = hourPlayers.filter(
			(p) => p.sheet_tab != requiredUser.sheet_tab,
		);

		if (isPush) {
			// Filter only T4L;
			const LeggyPlayers = otherPlayers.filter((p) => p.deflector === 'T4L');
			
			// Get MaxEpics for this contracts sorted by TE
			const maxEpics = MAX_EPIC_DEFLECTORS.get(contract.max_coop_size);
			const epicPlayers = otherPlayers
				.filter((p) => p.deflector === 'T4E')
				.sort((a, b) => (parseInt(b.te, 10) || 0) - (parseInt(a.te, 10) || 0))
				.slice(0, maxEpics);
			
			// Form players to pushRun
			const filteredPushPlayers = [...LeggyPlayers, ...epicPlayers];
			if (filteredPushPlayers.length < contract.max_coop_size) {
				continue;
			}
			
			// Push run: sort by TE, keeping the push user on top.
			filteredPushPlayers.sort(
				(a, b) => (parseInt(b.te, 10) || 0) - (parseInt(a.te, 10) || 0),
			);
			finalPlayers = [requiredPlayer, ...filteredPushPlayers].filter(
				Boolean,
			);
		} else {
			// Not a push run: shuffle players randomly.
			for (let i = otherPlayers.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[otherPlayers[i], otherPlayers[j]] = [
					otherPlayers[j],
					otherPlayers[i],
				];
			}
			finalPlayers = [requiredPlayer, ...otherPlayers].filter(Boolean);
		}

		if (finalPlayers.length >= contract.max_coop_size) {
			availableSlots.push({
				hour,
				players: finalPlayers,
				playerCount: finalPlayers.length,
				totalTE: finalPlayers.slice(0, contract.max_coop_size).reduce(
					(sum, p) => sum + (parseInt(p.te, 10) || 0),
					0,
				),
			});
		}
	}

	if (availableSlots.length === 0) {
		await interaction.editReply(
			createTextComponentMessage(
				`No time slots on the selected day have enough players (${contract.max_coop_size}) for \`${contract.name}\`.`,
			),
		);
		return;
	}

	// Group slots that have the exact same set of players
	const groupedSlots = new Map();
	for (const slot of availableSlots) {
		const playerIds = [...slot.players]
			.sort((a, b) => b.sheet_tab.localeCompare(a.sheet_tab))
			.map((p) => p.sheet_tab)
			.join(',');
		if (!groupedSlots.has(playerIds)) {
			groupedSlots.set(playerIds, {
				hours: [],
				players: slot.players,
				playerCount: slot.playerCount,
				totalTE: slot.totalTE,
			});
		}
		groupedSlots.get(playerIds).hours.push(slot.hour);
	}

	const finalSlots = Array.from(groupedSlots.values());
    let title = `Rerun Slots to you for \`${contract.name}\``;

	if (isPush) {
		finalSlots.sort((a, b) => b.totalTE - a.totalTE);
        title = `Rerun Slots to push \`${requiredUser.discord_name}\` for \`${contract.name}\``;
	} else {
		finalSlots.sort((a, b) => b.playerCount - a.playerCount);
	}

	const dayLabel = WEEK_DAYS.find((d) => d.value === day)?.label;
	const embed = new EmbedBuilder()
		.setTitle(title)
		.setDescription(
			`Showing available slots for **${dayLabel}** with at least **${contract.max_coop_size}** players.`,
		)
		.setColor(isPush ? '#FFD700' : '#0099FF')
		.setTimestamp();

	if (isPush) {
		embed.setFooter({
			text: 'Slots sorted by highest total TE (Push Mode)',
		});
	} else {
		embed.setFooter({ text: 'Slots sorted by most players' });
	}

	const topSlots = finalSlots.slice(0, 5);
	for (const slot of topSlots) {
		let playerList;
		playerList = slot.players
			.map((p) => `\`${p.sheet_tab}\` - ${p.deflector} - ${p.te}`)
			.join('\n');

		const hourLabels = formatHourRanges(slot.hours);

		let title = `${hourLabels} - ${slot.playerCount} Players`;
		if (isPush) {
			title += ` (Total TE: ${slot.totalTE})`;
		}

		embed.addFields({
			name: title,
			value: playerList || 'No players to show.',
			inline: false,
		});
	}

	if (finalSlots.length > 5) {
		embed.addFields({
			name: '...',
			value: `${finalSlots.length - 5} more groups of players available.`,
		});
	}

	await interaction.editReply({ embeds: [embed] });
}

export async function autocomplete(interaction) {
	const focusedOption = interaction.options.getFocused(true);
	const focusedValue = focusedOption.value.toLowerCase();

	if (focusedOption.name === 'contract') {
		try {
			const { seasonal } = await fetchActiveContracts({
				allowRefresh: false,
			});
			const contracts = seasonal.map(([name, id]) => ({
				name: name,
				value: id,
			}));
			const filtered = contracts
				.filter(
					(contract) =>
						contract.name.toLowerCase().includes(focusedValue) ||
						contract.value.toLowerCase().includes(focusedValue),
				)
				.slice(0, 25);

			await interaction.respond(filtered);
		} catch (error) {
			console.error(
				'Error fetching recent contracts for autocomplete:',
				error,
			);
			await interaction.respond([]);
		}
	} else if (focusedOption.name === 'pushed') {
		try {
			const members = listAllMembers();
			const filtered = members
				.filter(
					(member) =>
						member.is_pushed &&
						member.discord_name
							.toLowerCase()
							.includes(focusedValue),
				)
				.map((member) => ({
					name: member.discord_name,
					value: member.discord_id,
				}))
				.slice(0, 25);

			await interaction.respond(filtered);
		} catch (error) {
			console.error('Error fetching players for autocomplete:', error);
			await interaction.respond([]);
		}
	}
}

export default { data, execute, autocomplete };
