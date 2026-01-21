import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../utils/permissions.js', () => ({
  grantMamaBird: vi.fn(),
  revokeMamaBird: vi.fn(),
  isUserMamaBird: vi.fn(),
}));

import { grantMamaBird, revokeMamaBird, checkMamaBird } from '../../../services/mamabirdService.js';
import { grantMamaBird as grant, revokeMamaBird as revoke, isUserMamaBird } from '../../../utils/permissions.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('services/mamabirdService', () => {
  it('rejects missing ids', () => {
    expect(grantMamaBird()).toEqual({ ok: false, reason: 'invalid-id' });
    expect(revokeMamaBird()).toEqual({ ok: false, reason: 'invalid-id' });
    expect(checkMamaBird()).toBe(false);
  });

  it('wraps grant/revoke results', () => {
    grant.mockReturnValue({ updated: true });
    revoke.mockReturnValue({ updated: false, reason: 'no-change' });

    expect(grantMamaBird('123')).toEqual({ ok: true, reason: undefined, unchanged: undefined });
    expect(revokeMamaBird('123')).toEqual({ ok: false, reason: 'no-change', unchanged: undefined });
  });

  it('delegates check to permissions', () => {
    isUserMamaBird.mockReturnValue(true);
    expect(checkMamaBird('123')).toBe(true);
  });
});
