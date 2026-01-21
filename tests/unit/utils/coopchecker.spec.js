import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postMock, loadProto, state } = vi.hoisted(() => {
  const state = { responseQueue: [] };
  const postMock = vi.fn();

  const makeRequestType = () => ({
    create: (payload) => payload,
    verify: () => null,
    encode: () => ({ finish: () => Buffer.from('req') }),
  });

  const makeAuthenticatedType = () => ({
    decode: () => ({ message: Buffer.from('resp') }),
  });

  const makeResponseType = () => ({
    decode: () => state.responseQueue.shift() ?? {},
  });

  const lookupType = (name) => {
    if (name === 'ei.ContractCoopStatusRequest') {
      return makeRequestType();
    }

    if (name === 'ei.AuthenticatedMessage') {
      return makeAuthenticatedType();
    }

    return makeResponseType();
  };

  const loadProto = vi.fn(async () => ({ lookupType }));

  return { postMock, loadProto, state };
});

vi.mock('axios', () => ({
  default: {
    post: (...args) => postMock(...args),
  },
}));

vi.mock('protobufjs', () => ({
  default: {
    load: loadProto,
  },
}));

import { checkCoop, checkAllFromContractID, fetchCoopContributors } from '../../../utils/coopchecker.js';

beforeEach(() => {
  vi.clearAllMocks();
  state.responseQueue = [];
});

describe('utils/coopchecker', () => {
  it('returns free status when coop is not created', async () => {
    state.responseQueue.push({});
    postMock.mockResolvedValue({ data: 'ignored' });

    const result = await checkCoop('c1', 'aa');
    expect(result.free).toBe(true);
  });

  it('returns errors when request fails', async () => {
    postMock.mockRejectedValue(new Error('boom'));

    const result = await checkCoop('c1', 'aa');
    expect(result.error).toContain('boom');
  });

  it('filters free coops when checking multiple', async () => {
    state.responseQueue.push({ totalAmount: 1 }, {});
    postMock.mockResolvedValue({ data: 'ignored' });

    const result = await checkAllFromContractID('c1', ['aa', 'bb']);
    expect(result.filteredResults).toEqual(['bb']);
  });

  it('fetches contributors', async () => {
    state.responseQueue.push({ contributors: [{ userName: 'Ace' }] });
    postMock.mockResolvedValue({ data: 'ignored' });

    const contributors = await fetchCoopContributors('c1', 'aa');
    expect(contributors.length).toBe(1);
  });
});
