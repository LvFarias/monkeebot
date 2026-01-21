import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction } from '../commands/helpers.js';

vi.mock('../../../utils/database/index.js', () => ({
  isMamaBird: vi.fn(),
  setMamaBirdStatus: vi.fn(),
}));

import { requireMamaBird, grantMamaBird, revokeMamaBird, isUserMamaBird } from '../../../utils/permissions.js';
import { isMamaBird, setMamaBirdStatus } from '../../../utils/database/index.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('utils/permissions', () => {
  it('allows Mama Birds without replying', async () => {
    isMamaBird.mockReturnValue(true);
    const interaction = createInteraction();

    const allowed = await requireMamaBird(interaction);

    expect(allowed).toBe(true);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('replies when denied', async () => {
    isMamaBird.mockReturnValue(false);
    const interaction = createInteraction();

    const allowed = await requireMamaBird(interaction);

    expect(allowed).toBe(false);
    expect(interaction.reply).toHaveBeenCalled();
  });

  it('follows up when already replied', async () => {
    isMamaBird.mockReturnValue(false);
    const interaction = createInteraction();
    interaction.replied = true;

    const allowed = await requireMamaBird(interaction);

    expect(allowed).toBe(false);
    expect(interaction.followUp).toHaveBeenCalled();
  });

  it('delegates set/revoke/check', () => {
    setMamaBirdStatus.mockReturnValue({ updated: true });
    isMamaBird.mockReturnValue(true);

    expect(grantMamaBird('1')).toEqual({ updated: true });
    expect(revokeMamaBird('1')).toEqual({ updated: true });
    expect(isUserMamaBird('1')).toBe(true);
  });
});
