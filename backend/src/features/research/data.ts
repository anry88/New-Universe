import { ResearchDefinition } from '@shared/types/research.js';
import { RESEARCH_TECH_TREE } from '../../config/research-catalog.js';

export const TECH_TREE: ResearchDefinition[] = RESEARCH_TECH_TREE.map(({ effects: _effects, ...definition }) => definition);

// Helper to get research by branch and level
export function getResearchDef(branch: string, level: number): ResearchDefinition | undefined {
  return TECH_TREE.find(r => r.branch === branch && r.level === level);
}
