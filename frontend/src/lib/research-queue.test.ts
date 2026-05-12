import { describe, expect, it } from 'vitest';
import { getActiveResearch, researchStartBlockedByActive } from './research-queue';
import type { ResearchProgress } from '@shared/types/research';

const NOW = new Date('2026-05-12T10:00:00.000Z').getTime();

function row(branch: string, completesAt: string | null): ResearchProgress {
  return {
    userId: 'u',
    branch,
    level: 0,
    completesAt,
  };
}

describe('research queue helpers', () => {
  it('returns the active research with the nearest completion', () => {
    const rows = [row('engineering', '2026-05-12T10:20:00.000Z'), row('mining', '2026-05-12T10:05:00.000Z')];

    expect(getActiveResearch(rows, NOW)?.branch).toBe('mining');
  });

  it('ignores completed, due, or idle research rows', () => {
    const rows = [row('engineering', null), row('mining', '2026-05-12T09:59:59.000Z')];

    expect(getActiveResearch(rows, NOW)).toBeNull();
  });

  it('blocks starting another branch while a timer is active', () => {
    const rows = [row('mining', '2026-05-12T10:05:00.000Z')];

    expect(researchStartBlockedByActive('engineering', rows, NOW)?.branch).toBe('mining');
    expect(researchStartBlockedByActive('mining', rows, NOW)).toBeNull();
  });
});
