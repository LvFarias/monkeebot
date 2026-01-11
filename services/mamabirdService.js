import { grantMamaBird as grant, revokeMamaBird as revoke, isUserMamaBird } from '../utils/permissions.js';

export function grantMamaBird(discordId) {
  if (!discordId) return { ok: false, reason: 'invalid-id' };
  const result = grant(discordId);
  return { ok: !!result.updated, reason: result.reason, unchanged: result.unchanged };
}

export function revokeMamaBird(discordId) {
  if (!discordId) return { ok: false, reason: 'invalid-id' };
  const result = revoke(discordId);
  return { ok: !!result.updated, reason: result.reason, unchanged: result.unchanged };
}

export function checkMamaBird(discordId) {
  if (!discordId) return false;
  return isUserMamaBird(discordId);
}

export default {
  grantMamaBird,
  revokeMamaBird,
  checkMamaBird,
};
