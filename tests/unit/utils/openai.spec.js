import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
}));

vi.mock('openai', () => ({
  default: function OpenAI() {
    this.chat = { completions: { create: createMock } };
  },
}));

import { getMonkeeReply } from '../../../utils/openai.js';

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OPENAI_API_KEY;
});

describe('utils/openai', () => {
  it('returns null when api key is missing', async () => {
    const result = await getMonkeeReply([{ role: 'user', content: 'hi' }]);
    expect(result).toBeNull();
  });

  it('returns response content when configured', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    createMock.mockResolvedValue({ choices: [{ message: { content: 'yo' } }] });

    const result = await getMonkeeReply([{ role: 'user', content: 'hi' }]);

    expect(result).toBe('yo');
    expect(createMock).toHaveBeenCalled();
  });
});
