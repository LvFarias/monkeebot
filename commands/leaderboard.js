import { SlashCommandBuilder } from 'discord.js';
import { buildLeaderboardReport } from '../services/leaderboardService.js';
import { listSeasons } from '../services/seasonService.js';
import { chunkContent, createTextComponentMessage } from '../services/discord.js';

const MAX_SECTION_ENTRIES = 100;

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Compare stored IGNs against the seasonal leaderboard')
  .addStringOption(option =>
    option
      .setName('season')
      .setDescription('Season identifier (e.g., fall_2025)')
      .setRequired(true)
      .setAutocomplete(true)
  )

export async function execute(interaction) {
  const scope = interaction.options.getString('season', true);

  await interaction.deferReply();

  try {
    const report = await buildLeaderboardReport({ scope });

    const lines = [];
    lines.push(`**Leaderboard - ${report.scope} **`);

    if (report.matches.length) {
      const matchPreview = report.matches.slice(0, MAX_SECTION_ENTRIES);
      for (const match of matchPreview) {
        lines.push(`#${match.rank} ${match.alias} <@${match.discordId}>`);
      }
      if (report.matches.length > matchPreview.length) {
        lines.push(`…and ${report.matches.length - matchPreview.length} more matches.`);
      }
    } else {
      lines.push('', 'none found.... wtf get some runs in bozo');
    }

    const chunks = chunkContent(lines);
    const [first, ...rest] = chunks;

    await interaction.editReply(
      createTextComponentMessage(first, { allowedMentions: { users: [] } })
    );

    for (const chunk of rest) {
      await interaction.followUp(
        createTextComponentMessage(chunk, { allowedMentions: { users: [] } })
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply(
      createTextComponentMessage(`⚠️ ${message}`, { allowedMentions: { users: [] } })
    );
  }
}

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused()?.toLowerCase?.() ?? '';
  const seasons = listSeasons();
  const filtered = seasons
    .filter(season => season.toLowerCase().includes(focused))
    .slice(0, 5)
    .map(season => ({ name: season, value: season }));

  await interaction.respond(filtered);
}

export default { data, execute, autocomplete };
