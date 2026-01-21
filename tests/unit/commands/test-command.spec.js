import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../services/seasonService.js', () => ({
  listSeasons: vi.fn(),
}));

import { autocomplete } from '../../../commands/sendlinks.js';
import { listSeasons } from '../../../services/seasonService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commands/sendlinks autocomplete', () => {
  it('filters season suggestions', async () => {
    listSeasons.mockReturnValue(['fall_2025', 'spring_2025', 'summer_2024']);

    const interaction = createInteraction({
      options: createOptions({ focused: 'fall' }),
    });

    await autocomplete(interaction);

    expect(interaction.respond).toHaveBeenCalled();
    const results = interaction.respond.mock.calls[0][0];
    expect(results[0].value).toBe('fall_2025');
  });

  it('returns empty when nothing matches', async () => {
    listSeasons.mockReturnValue(['fall_2025']);

    const interaction = createInteraction({
      options: createOptions({ focused: 'winter' }),
    });

    await autocomplete(interaction);

    expect(interaction.respond).toHaveBeenCalled();
    expect(interaction.respond.mock.calls[0][0]).toEqual([]);
  });
});
