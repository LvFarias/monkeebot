import { google } from 'googleapis';
import path from 'node:path';
import fs from 'node:fs';
import { convertEstToUtc, convertUtcToEst } from '../utils/eggStandartTime.js';

// --- Configuration ---
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const CURRENT_CONTRACTS_TAB_NAME = 'Current Contracts';
const CREDENTIALS_PATH = path.join(process.cwd(), 'google-credentials.json');

const ROW_TO_EST = {
	11: 0, // Row 12
	12: 1, // Row 13
	13: 2, // Row 14
	14: 3, // Row 15
	15: 4, // Row 16
	16: 5, // Row 17
	17: 6, // Row 18
	18: 7, // Row 19
	19: 8, // Row 20
	20: 9, // Row 21
	21: 10, // Row 22
	22: -4, // Row 23
	23: -3, // Row 24
	24: -2, // Row 25
	25: -1, // Row 26
};
const DEFLECTOR_MAP = {
	C: 'T4C',
	R: 'T4R',
	E: 'T4E',
	L: 'T4L',
};
const IGNORED_TABS = [
	'Instructions',
	'Filter',
	'Current Contracts',
	'Template',
	'Instructions',
	'Config',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
	'Sunday',
];

const EST_TO_ROW = {
	0: 11,
	1: 12,
	2: 13,
	3: 14,
	4: 15,
	5: 16,
	6: 17,
	7: 18,
	8: 19,
	9: 20,
	10: 21,
	'-4': 22,
	'-3': 23,
	'-2': 24,
	'-1': 25,
};
const ALL_EST_HOURS = Object.keys(EST_TO_ROW).map((k) => parseInt(k, 10));

async function getSheetsClient() {
	if (!fs.existsSync(CREDENTIALS_PATH)) {
		console.error(`Credentials file not found at: ${CREDENTIALS_PATH}`);
		return null;
	}

	try {
		const auth = new google.auth.GoogleAuth({
			keyFile: CREDENTIALS_PATH,
			scopes: ['https://www.googleapis.com/auth/spreadsheets'],
		});
		return google.sheets({ version: 'v4', auth });
	} catch (error) {
		console.error('Error creating Google Sheets client:', error);
		return null;
	}
}

async function getContractMapFromSheet() {
	try {
		const sheetsClient = await getSheetsClient();
		if (!sheetsClient) {
			throw new Error('Sheets client is invalid.');
		}
		const response = await sheetsClient.spreadsheets.values.get({
			spreadsheetId: SPREADSHEET_ID,
			range: CURRENT_CONTRACTS_TAB_NAME,
		});
		const rows = response.data.values;
		if (!rows || rows.length < 5) {
			throw new Error('No data found in the Current Contracts tab.');
		}
		const contractMap = {};
		// Contract IDs are in E3, E4, E5 (rows 2, 3, 4)
		for (let i = 2; i <= 4; i++) {
			const contractId = rows[i] ? String(rows[i][4] || '').trim() : '';
			contractMap[i - 1] = contractId; // Map to user sheet row index (H2, H3, H4)
		}
		return contractMap;
	} catch (e) {
		console.error('Error fetching contract map from sheet:', e);
		throw e;
	}
}

async function getPlayerFromSheet(tabName, contractId, day, hours, isUltraOnly) {
	try {
		const sheetsClient = await getSheetsClient();
		if (!sheetsClient || !tabName) {
			return null;
		}

		const response = await sheetsClient.spreadsheets.values.batchGet({
			spreadsheetId: SPREADSHEET_ID,
			ranges: [tabName, CURRENT_CONTRACTS_TAB_NAME],
		});

		const [userValueRange, contractsValueRange] = response.data.valueRanges;

		const userRows = userValueRange.values;
		if (!userRows || userRows.length === 0) {
			return null;
		}

		if (!contractsValueRange || contractsValueRange.values.length === 0) {
			return null;
		}

		if (!userRows || userRows.length === 0) {
			return null;
		}

		if (userRows.length < 5) {
			return null;
		}

		const contractRowsData = contractsValueRange.values;
		if (!contractRowsData || contractRowsData.length < 5) {
			return null;
		}

		// --- Get Selected Contracts ---
		// Contract IDs are in 'Current Contracts'!E3, E4, E5
		// Participation flags are in user's sheet at H2, H3, H4
		const selectedContracts = [];
		const contractMap = {
			1: 2, // H2 (user) -> E3 (contracts)
			2: 3, // H3 (user) -> E4 (contracts)
			3: 4, // H4 (user) -> E5 (contracts)
		};

		for (const userRowIndex in contractMap) {
			const contractRowIndex = contractMap[userRowIndex];
			const wantsToRun = userRows[userRowIndex]
				? String(userRows[userRowIndex][7] || '').toUpperCase() ===
					'TRUE'
				: false;
			const contract_id = contractRowsData[contractRowIndex]
				? String(contractRowsData[contractRowIndex][4] || '').trim()
				: '';
			if (wantsToRun && contract_id) {
				selectedContracts.push(contract_id);
			}
		}

		if (!selectedContracts.includes(contractId)) {
			return null;
		}

		// --- Get Player Info (Deflector, TE and Ultra) ---
		// Name is in B2, Deflector is in B3, TE is in D3, Ultra status is in B5
		const nameCell = userRows[1] ? String(userRows[1][1] || '') : '';
		const defCell = userRows[2]
			? String(userRows[2][1] || '').toUpperCase()
			: '';
		const teCell = userRows[2] ? String(userRows[2][3] || '') : '';
		const ultraCell = userRows[4]
			? String(userRows[4][1] || '').toLowerCase()
			: '';

		const user = {
			sheet_tab: tabName,
			name: nameCell.trim() || null,
			deflector: DEFLECTOR_MAP[defCell] || null,
			te: teCell.trim() || null,
			hasUltra: ultraCell === 'yes',
			hours: []
		};
		if(!user.hasUltra && isUltraOnly) {
			return null;
		}

		// --- Get Weekly Schedule ---
		// Columns B to H correspond to Monday to Sunday
		const userHours = [];
		for (const rowIndexStr in ROW_TO_EST) {
			const rowIndex = parseInt(rowIndexStr, 10);
			const dayIdx = parseInt(day, 10);
			if (
				userRows[rowIndex] &&
				String(userRows[rowIndex][dayIdx]).toUpperCase() === 'TRUE' &&
				(hours.length == 0 || hours.includes(ROW_TO_EST[rowIndex]))
			) {
				userHours.push(ROW_TO_EST[rowIndex]);
			}
		}
		user.hours = convertEstToUtc(userHours);
		return user;
	} catch (error) {
		console.error(error);
		return null;
	}
}

export async function findPlayersForRerun(contractId, day, hours, isUltraOnly) {
	const players = [];
	const tabs = await fetchUserTabNames();
	for (const tabName of tabs) {
		try {
			const player = await getPlayerFromSheet(tabName, contractId, day, hours, isUltraOnly);
			if (player) {
				players.push(player);
			}
		} catch (error) {
			console.error('Error fetching player for rerun:', error);
		}
	}
	return players;
}

export async function getUserSchedule(tabName) {
	try {
		const sheetsClient = await getSheetsClient();
		if (!sheetsClient || !tabName) {
			throw new Error('Sheets client or tab name is invalid.');
		}

		const response = await sheetsClient.spreadsheets.values.batchGet({
			spreadsheetId: SPREADSHEET_ID,
			ranges: [tabName],
		});

		const [userValueRange] = response.data.valueRanges;

		const userRows = userValueRange.values;
		if (!userRows || userRows.length === 0) {
			throw new Error('No data found in the specified tab.');
		}

		if (!userRows || userRows.length === 0) {
			throw new Error('No data found in the specified tab.');
		}

		if (userRows.length < 5) {
			throw new Error('No data found in the specified tab.');
		}

		const schedule = new Map();
		// --- Get Weekly Schedule ---
		// Columns B to H correspond to Monday to Sunday
		for (let i = 1; i <= 7; i++) {
			for (const rowIndexStr in ROW_TO_EST) {
				const rowIndex = parseInt(rowIndexStr, 10);
				if (
					userRows[rowIndex] &&
					String(userRows[rowIndex][i]).toUpperCase() === 'TRUE'
				) {
					const hour_utc = convertEstToUtc([ROW_TO_EST[rowIndex]])[0];
					if (!schedule.has(i)) {
						schedule.set(i, new Set());
					}
					schedule.get(i).add(hour_utc);
				}
			}
		}
		return schedule;
	} catch (error) {
		throw error;
	}
}

export async function updatePlayerInfoInSheet({
	te,
	tabName,
	hasUltra,
	deflector,
	discordName,
}) {
	try {
		const sheetsClient = await getSheetsClient();
		if (!sheetsClient || !tabName) {
			throw new Error('Sheets client or tab name is invalid.');
		}

		const data = [];

		// Discord Name goes in B2
		if (discordName) {
			data.push({ range: `${tabName}!B2`, values: [[discordName]] });
		}

		// Deflector goes in B3
		if (deflector) {
			const deflectorCode = Object.keys(DEFLECTOR_MAP).find(
				(k) => DEFLECTOR_MAP[k] === deflector,
			);
			data.push({ range: `${tabName}!B3`, values: [[deflectorCode]] });
		}

		// TE goes in D3
		if (te) {
			data.push({ range: `${tabName}!D3`, values: [[te]] });
		}

		// Ultra status goes in B5
		if (hasUltra !== undefined) {
			data.push({
				range: `${tabName}!B5`,
				values: [[hasUltra ? 'Yes' : 'No']],
			});
		}

		if (data.length === 0) return;

		await sheetsClient.spreadsheets.values.batchUpdate({
			spreadsheetId: SPREADSHEET_ID,
			requestBody: { valueInputOption: 'USER_ENTERED', data },
		});
	} catch (error) {
		throw error;
	}
}

export async function fetchUserTabNames() {
	try {
		const sheetsClient = await getSheetsClient();
		if (!sheetsClient) {
			throw new Error('Sheets client is invalid.');
		}

		const spreadsheetInfo = await sheetsClient.spreadsheets.get({
			spreadsheetId: SPREADSHEET_ID,
			fields: 'sheets.properties.title',
		});

		const allTabs = spreadsheetInfo.data.sheets.map(
			(sheet) => sheet.properties.title,
		);
		return allTabs.filter((tab) => !IGNORED_TABS.includes(tab));
	} catch (error) {
		throw error;
	}
}

export async function updateContractsInSheet(sheetTab, contract, wanted) {
	try {
		const sheetsClient = await getSheetsClient();
		if (!sheetsClient || !sheetTab) {
			throw new Error('Sheets client or tab name is invalid.');
		}

		const contractMap = await getContractMapFromSheet();
		const data = [];

		for (const userRowIndex in contractMap) {
			const contractId = contractMap[userRowIndex];
			if (contractId == contract) {
				const rowIndex = parseInt(userRowIndex, 10);
				const cell = `H${rowIndex + 1}`; // H2, H3, H4
				data.push({
					range: `${sheetTab}!${cell}`,
					values: [[wanted ? 'TRUE' : 'FALSE']],
				});
			}
		}
		await sheetsClient.spreadsheets.values.batchUpdate({
			spreadsheetId: SPREADSHEET_ID,
			requestBody: {
				valueInputOption: 'USER_ENTERED',
				data,
			},
		});
	} catch (e) {
		throw e;
	}
}

export async function updateScheduleInSheet(sheetTab, dayOfWeek, utcHours) {
	try {
		const sheetsClient = await getSheetsClient();
		if (!sheetsClient || !sheetTab) {
			throw new Error('Sheets client or tab name is invalid.');
		}

		const availableHours = new Set(utcHours.map(convertUtcToEst));

		const data = [];
		for (const estHour of ALL_EST_HOURS) {
			const rowIndex = EST_TO_ROW[estHour];
			const value = availableHours.has(estHour) ? 'TRUE' : 'FALSE';
			// Using A1 notation. Column B is Monday, C is Tuesday, etc.
			const columnLetter = String.fromCharCode(
				'A'.charCodeAt(0) + dayOfWeek,
			);
			const cell = `${columnLetter}${rowIndex + 1}`;
			data.push({
				range: `${sheetTab}!${cell}`,
				values: [[value]],
			});
		}
		await sheetsClient.spreadsheets.values.batchUpdate({
			spreadsheetId: SPREADSHEET_ID,
			requestBody: {
				valueInputOption: 'USER_ENTERED',
				data,
			},
		});
	} catch (e) {
		throw e;
	}
}

export default {
	getUserSchedule,
	updatePlayerInfoInSheet,
	findPlayersForRerun,
	fetchUserTabNames,
	updateScheduleInSheet,
	updateContractsInSheet,
};
