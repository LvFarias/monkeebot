import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { listAllCoops } from '../services/coopService.js';
import { listSeasons } from '../services/seasonService.js';
import { createTextComponentMessage } from '../services/discord.js';

export const data = new SlashCommandBuilder()
  .setName('sendlinks')
  .setDescription('Create a text file with cooptracker links for all saved coops')
  .addBooleanOption(option =>
    option.setName('push_only')
      .setDescription('Only include coops marked as push')
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('season')
      .setDescription('Only include coops from this season')
      .setRequired(false)
      .setAutocomplete(true)
  );

export async function execute(interaction) {
  const pushOnly = interaction.options.getBoolean('push_only') ?? false;
  const season = interaction.options.getString('season') || null;

  const rows = listAllCoops({ pushOnly, season });
  if (!rows || rows.length === 0) {
    const seasonMessage = season ? ' for season ' + season : '';
    await interaction.reply(
      createTextComponentMessage(`No coops found for the requested filter${seasonMessage}.`, { flags: 64 })
    );
    return;
  }

  const lines = rows.map(r => `https://eicoop-carpet.netlify.app/${r.contract}/${r.coop}/`);

  // Write to a temporary file in the data directory
  const outDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const filename = `coop-links-${Date.now()}.txt`;
  const filepath = path.join(outDir, filename);
  fs.writeFileSync(filepath, lines.join('\n'));

  const attachment = new AttachmentBuilder(filepath, { name: filename });
  await interaction.reply({ content: `Created ${rows.length} links.`, files: [attachment] });

  // Clean up the temporary file after sending
  fs.unlinkSync(filepath);
}

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const allSeasons = listSeasons();
  const filtered = allSeasons
    .filter(s => s.toLowerCase().includes(focused))
    .slice(0, 4);
  await interaction.respond(filtered.map(s => ({ name: s, value: s })));
}

export default { data, execute, autocomplete };
