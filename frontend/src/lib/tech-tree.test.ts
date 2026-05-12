import { describe, expect, it } from 'vitest';
import { TECH_TREE_DATA, BRANCHES, RESEARCH_MAX_LEVEL } from './tech-tree';

describe('tech-tree (P2 research UI source)', () => {
  it('covers every branch with exactly five tiers through RESEARCH_MAX_LEVEL', () => {
    expect(RESEARCH_MAX_LEVEL).toBe(5);
    expect(BRANCHES).toHaveLength(7);
    expect(TECH_TREE_DATA).toHaveLength(BRANCHES.length * RESEARCH_MAX_LEVEL);

    const counts = new Map<string, number>();
    const maxLevel = new Map<string, number>();
    for (const entry of TECH_TREE_DATA) {
      counts.set(entry.branch, (counts.get(entry.branch) ?? 0) + 1);
      maxLevel.set(entry.branch, Math.max(maxLevel.get(entry.branch) ?? 0, entry.level));
    }

    for (const b of BRANCHES) {
      expect(counts.get(b.id)).toBe(5);
      expect(maxLevel.get(b.id)).toBe(5);
    }
    expect(BRANCHES.some((branch) => branch.id === 'energy')).toBe(true);
  });
});
