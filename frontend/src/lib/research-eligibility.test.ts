import { describe, expect, it } from 'vitest';
import { evaluateResearchEligibility } from './research-eligibility.js';
import type { ResearchProgress } from '@shared/types/research';

const miningL2 = {
  branch: 'mining',
  level: 2,
  name: { ru: '', en: '' },
  description: { ru: '', en: '' },
  cost: {},
  timeSec: 1,
  requirements: {
    buildings: [{ typeId: 'lab', level: 2 }],
    research: [{ branch: 'mining', level: 1 }],
  },
};

describe('evaluateResearchEligibility', () => {
  it('passes when lab and prerequisites satisfied', () => {
    const rows: ResearchProgress[] = [{ userId: 'u', branch: 'mining', level: 1, completesAt: null }];
    const r = evaluateResearchEligibility(miningL2, 2, rows);
    expect(r.ok).toBe(true);
    expect(r.missingResearch.length).toBe(0);
  });

  it('fails when lab too low', () => {
    const r = evaluateResearchEligibility(miningL2, 1, []);
    expect(r.ok).toBe(false);
    expect(r.labMessage).toMatch(/Laboratory level 2/);
  });

  it('fails when prerequisite research missing', () => {
    const r = evaluateResearchEligibility(miningL2, 3, []);
    expect(r.ok).toBe(false);
    expect(r.missingResearch.some((m) => m.branch === 'mining')).toBe(true);
  });

  it('uses localized resource labels in shortage messages', () => {
    const r = evaluateResearchEligibility(
      {
        ...miningL2,
        cost: { oil: 10 },
        requirements: {},
      },
      1,
      [],
      [{ resourceId: 'oil', amount: 2 }],
      'ru',
    );

    expect(r.ok).toBe(false);
    expect(r.resourceMessage).toContain('Нефть');
    expect(r.resourceMessage).not.toContain('oil');
  });
});
