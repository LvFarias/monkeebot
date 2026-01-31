import { SlashCommandBuilder } from 'discord.js';
import {
  createScheduleComponents,
  DEFLECTOR_CHOICES,
} from '../services/bnPlayerService.js';
import { fetchActiveContracts } from '../services/contractService.js';
import { createTextComponentMessage } from '../services/discord.js';
import {
  getUserSchedule,
  updateContractsInSheet,
  updatePlayerInfoInSheet,
  updateScheduleInSheet,
} from '../services/googleSheetService.js';
import { getMemberTabName } from '../utils/database/membersRepository.js';

export const data = new SlashCommandBuilder()
	.setName('bn-me')
	.setDescription('Update your reruns infos.')
	.addSubcommand((subcommand) =>
		subcommand
			.setName('update')
			.setDescription("Update your player infos on Quail's Sheet.")
			.addStringOption((option) =>
				option
					.setName('def')
					.setDescription('Your best deflector.')
					.setRequired(true)
					.addChoices(...DEFLECTOR_CHOICES),
			)
			.addStringOption((option) =>
				option
					.setName('te')
					.setDescription('Your TE amount (e.g., 45, 100).')
					.setRequired(true),
			)
			.addBooleanOption((option) =>
				option
					.setName('ultra')
					.setDescription('Do you have Ultra? (Yes/No)')
					.setRequired(true),
			),
	)
	.addSubcommand((subcommand) =>
		subcommand
			.setName('contracts')
			.setDescription('Update your selected contracts.')
			.addStringOption((option) =>
				option
					.setName('contract')
					.setDescription('Contract to toggle selection.')
					.setRequired(true)
					.setAutocomplete(true),
			)
			.addBooleanOption((option) =>
				option
					.setName('wanted')
					.setDescription('Do you want to run this contract?')
					.setRequired(true),
			),
	)
	.addSubcommand((subcommand) =>
		subcommand
			.setName('schedule')
			.setDescription('Update your available hours for this week.'),
	);

export async function autocomplete(interaction) {
	const focusedOption = interaction.options.getFocused(true);
	if (focusedOption.name === 'contract') {
		try {
			const focusedValue = focusedOption.value.toLowerCase();

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
	}
}

export async function execute(interaction) {
	const subcommand = interaction.options.getSubcommand();
	switch (subcommand) {
		case 'update':
			await handleUpdatePlayerInfos(interaction);
			break;
		case 'contracts':
			await handleUpdatePlayerContracts(interaction);
			break;
		case 'schedule':
			await handleUpdatePlayerSchedule(interaction);
			break;
		default:
			await interaction.reply(
				createTextComponentMessage(
					`Unknown subcommand: ${subcommand}`,
					{ flags: 64 },
				),
			);
	}
}

async function handleUpdatePlayerInfos(interaction) {
	try {
		const member = getMemberTabName(interaction.user.id);
		const user = {
			tabName: member.sheet_tab,
			discordId: interaction.user.id,
			discordName: interaction.user.username,
			te: interaction.options.getString('te', true),
			deflector: interaction.options.getString('def', true),
			hasUltra: interaction.options.getBoolean('ultra', true),
		};

		await updatePlayerInfoInSheet(user);

		const replyMessage = `
            ## ✅ **${user.discordName}**, your BN info has been saved successfully!
            - TE: **${user.te}**
            - Deflector: **${user.deflector}**
            - Ultra: **${user.hasUltra ? 'Yes' : 'No'}**
        `;

		await interaction.reply(
			createTextComponentMessage(replyMessage, { ephemeral: true }),
		);
	} catch (error) {
		console.error('Error on handleUpdatePlayerInfos:', error);
		await interaction.reply(
			createTextComponentMessage(
				'An error occurred while trying to save your infos. Please try again later.',
				{ ephemeral: true },
			),
		);
	}
}

async function handleUpdatePlayerContracts(interaction) {
	try {
		const wanted = interaction.options.getBoolean('wanted', true);
		const contractId = interaction.options.getString('contract', true);

		await updateContractsInSheet(
			getMemberTabName(interaction.user.id).sheet_tab,
			contractId,
			wanted,
		);

		const replyMessage = `## ✅ **${interaction.user.username}**, your selected contracts have been updated!`;

		await interaction.reply(
			createTextComponentMessage(replyMessage, { ephemeral: true }),
		);
	} catch (error) {
		console.error('Error on handleUpdatePlayerContracts:', error);
		await interaction.reply(
			createTextComponentMessage(
				'An error occurred while updating your contracts. Please try again later.',
				{ ephemeral: true },
			),
		);
	}
}

async function handleUpdatePlayerSchedule(interaction) {
	await interaction.deferReply({ ephemeral: true });
	let selectedDay = 1;
	const tabName = getMemberTabName(interaction.user.id).sheet_tab;
	let schedule = await getUserSchedule(tabName);

	const reply = await interaction.editReply({
		content: `Hey ${interaction.user.toString()}, select a day to set your available hours.`,
		components: await createScheduleComponents(selectedDay, schedule),
	});

	const collector = reply.createMessageComponentCollector({
		time: 300_000,
		filter: (i) => i.user.id === interaction.user.id,
	});
	collector.on('error', async (error) => {
		console.error('Collector error:', error);
	});
	collector.on('collect', async (i) => {
		try {
			if (i.customId.startsWith('day_')) {
				selectedDay = parseInt(i.customId.split('_')[1], 10);
				await i.update({
					content: `Hey ${interaction.user.toString()}, select a day to set your available hours.`,
					components: await createScheduleComponents(
						selectedDay,
						schedule,
					),
				});
			} else if (i.customId === 'hour_select') {
				const selectedHours = i.values.map((v) => parseInt(v, 10));
				await updateScheduleInSheet(
					tabName,
					selectedDay,
					selectedHours,
				);
				schedule = await getUserSchedule(tabName);

				await i.update({
					content: `Hey ${interaction.user.toString()}, select a day to set your available hours.`,
					components: await createScheduleComponents(
						selectedDay,
						schedule,
					),
				});
			} else if (i.customId === 'finish_schedule') {
				await i.update({
					components: [],
					content: `✅ Thanks ${interaction.user.toString()}! Your schedule has been updated.`,
				});
				collector.stop();
			}
		} catch (error) {
			console.error('Error processing interaction:', error);
			const errorPayload = {
				content: 'An error occurred while processing your request.',
				components: [],
				ephemeral: true,
			};
			if (i.replied || i.deferred) {
				await i
					.followUp(errorPayload)
					.catch((e) => console.error('Follow-up error failed:', e));
			} else {
				await i
					.reply(errorPayload)
					.catch((e) => console.error('Reply error failed:', e));
			}
		}
	});
	collector.on('end', async (_, reason) => {
		if (reason === 'time') {
			await interaction.editReply({
				content: 'Schedule editor has timed out.',
				components: [],
			});
		}
	});
}

export default { data, execute, autocomplete };
