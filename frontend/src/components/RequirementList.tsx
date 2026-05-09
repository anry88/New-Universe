import React from 'react';
import type { ResearchRequirementRef } from '@shared/types/research';
import { RESEARCH_BRANCH_LABELS_EN } from '@shared/types/research';

export interface RequirementListProps {
  /** Human-readable title shown above the list */
  title?: string;
  missing: ResearchRequirementRef[];
  /** Which label set to use for branch names */
  locale?: 'en' | 'ru';
}

function branchLabel(branch: string, locale: 'en' | 'ru'): string {
  if (locale === 'ru') {
    return branch;
  }
  return RESEARCH_BRANCH_LABELS_EN[branch] ?? branch;
}

/**
 * Renders missing research prerequisites for gated actions (build, ships, colony, trade).
 */
export const RequirementList: React.FC<RequirementListProps> = ({
  title = 'Required research',
  missing,
  locale = 'en',
}) => {
  if (!missing.length) return null;

  return (
    <div className="req-list" data-testid="requirement-list">
      <div className="req-list-title">{title}</div>
      <ul className="req-list-items">
        {missing.map((req) => (
          <li key={`${req.branch}-${req.level}`}>
            {branchLabel(req.branch, locale)} — level {req.level}
          </li>
        ))}
      </ul>
    </div>
  );
};
