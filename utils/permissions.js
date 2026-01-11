import { isMamaBird, setMamaBirdStatus } from './database/index.js';

export async function requireMamaBird(interaction) {
  const userId = interaction?.user?.id;
  if (userId && isMamaBird(userId)) {
    return true;
  }

  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'This command is limited to Mama Birds.', flags: 64 });
    } else {
      await interaction.followUp({ content: 'This command is limited to Mama Birds.', flags: 64 });
    }
  } catch (err) {
    console.warn('Failed to send permission denial message:', err);
  }

  return false;
}

export function grantMamaBird(discordId) {
  return setMamaBirdStatus(discordId, true);
}

export function revokeMamaBird(discordId) {
  return setMamaBirdStatus(discordId, false);
}

export function isUserMamaBird(discordId) {
  return isMamaBird(discordId);
}
