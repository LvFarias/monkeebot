import { SlashCommandBuilder } from 'discord.js';
import { createTextComponentMessage } from '../services/discord.js';
import { fetchUserTabNames } from '../services/googleSheetService.js';
import { requireMamaBird } from '../utils/permissions.js';
import {
	listAllMembers,
	updateMemberPushedByDiscordId,
	upsertMember,
} from '../utils/database/membersRepository.js';

export const data = new SlashCommandBuilder()
	.setName('bn-set')
	.setDescription('Sets various BN player attributes. (Mama Bird only)')
	.addSubcommand((subcommand) =>
		subcommand
			.setName('pushed')
			.setDescription("Sets a player's pushed status for BN reruns.")
			.addStringOption((option) =>
				option
					.setName('player')
					.setDescription(
						'The player from the BN database to update.',
					)
					.setRequired(true)
					.setAutocomplete(true),
			)
			.addBooleanOption((option) =>
				option
					.setName('pushed')
					.setDescription('Set the pushed status to true or false.')
					.setRequired(true),
			),
	)
	.addSubcommand((subcommand) =>
		subcommand
			.setName('player_tab')
			.setDescription(
				"Sets a player's tab name from Quail\'s Sheet for BN reruns.",
			)
			.addUserOption((option) =>
				option
					.setName('discord_user')
					.setDescription(
						'The Discord ID of the player to register/update.',
					)
					.setRequired(true),
			)
			.addStringOption((option) =>
				option
					.setName('tab_name')
					.setDescription(
						"The tab name from Quail's Sheet for the player.",
					)
					.setRequired(true)
					.setAutocomplete(true),
			),
	);

export async function execute(interaction) {
	if (!(await requireMamaBird(interaction))) return;
	const subcommand = interaction.options.getSubcommand();
	switch (subcommand) {
		case 'pushed':
			await handleUpdatePlayerPushed(interaction);
			break;
		case 'player_tab':
			await handleSetPlayerTabName(interaction);
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

async function handleUpdatePlayerPushed(interaction) {
	const targetUserId = interaction.options.getString('player', true);
	const isPushed = interaction.options.getBoolean('pushed', true);

	try {
		updateMemberPushedByDiscordId(targetUserId, isPushed);
		await interaction.reply(
			createTextComponentMessage(
				`✅ <@${targetUserId}>'s pushed status has been set to **${isPushed}**.`,
				{ ephemeral: true },
			),
		);
	} catch (error) {
		console.error('Error setting pushed status:', error);
		await interaction.reply(
			createTextComponentMessage(
				'An error occurred while setting the pushed status.',
				{ ephemeral: true },
			),
		);
	}
}

async function handleSetPlayerTabName(interaction) {
	try {
		const targetUser = interaction.options.getUser('discord_user', true);
		const tabName = interaction.options.getString('tab_name', true);

		upsertMember({
			discordId: targetUser.id,
			discordName: targetUser.username,
			tabName: tabName,
			isActive: true,
		});

		let replyMessage = `
		  ## ✅ **${targetUser.username}**, has been updated successfully!
	  `;

		await interaction.reply(
			createTextComponentMessage(replyMessage, { ephemeral: true }),
		);
	} catch (error) {
		console.error('Error on handleUpdatePlayerInfos:', error);
		await interaction.reply(
			createTextComponentMessage(
				'Failed to import player infos from Google Sheets. Please ensure tab name is set correctly and try again.',
				{ ephemeral: true },
			),
		);
	}
}

export async function autocomplete(interaction) {
	const focusedOption = interaction.options.getFocused(true);
	const focusedValue = focusedOption.value.toLowerCase();

	if (focusedOption.name === 'tab_name') {
		try {
			const userTabs = await fetchUserTabNames();
			const focusedValue = focusedOption.value.toLowerCase();
			const filtered = userTabs
				.filter((tab) => tab.toLowerCase().includes(focusedValue))
				.slice(0, 25);

			await interaction.respond(
				filtered.map((tab) => ({ name: tab, value: tab })),
			);
		} catch (error) {
			console.error('Error fetching tab names for autocomplete:', error);
			await interaction.respond([]);
		}
	} else if (focusedOption.name === 'player') {
		try {
			const players = listAllMembers();
			const filtered = players
				.filter((player) =>
					player.discord_name.toLowerCase().includes(focusedValue),
				)
				.map((player) => ({
					name: player.discord_name,
					value: player.discord_id,
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
