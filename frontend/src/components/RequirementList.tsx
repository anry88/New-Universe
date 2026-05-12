import React from 'react';
import type { ResearchRequirementRef } from '@shared/types/research';
import { researchBranchLabel } from '@shared/types/research';
import { useI18n } from '../lib/i18n';

export interface RequirementListProps {
  /** Human-readable title shown above the list */
  title?: string;
  missing: ResearchRequirementRef[];
  /** Which label set to use for branch names */
  locale?: 'en' | 'ru';
}

function branchLabel(branch: string, locale: 'en' | 'ru'): string {
  return researchBranchLabel(branch, locale);
}

/**
 * Renders missing research prerequisites for gated actions (build, ships, colony, trade).
 */
export const RequirementList: React.FC<RequirementListProps> = ({
  title = 'Required research',
  missing,
  locale = 'en',
}) => {
  const { t } = useI18n();
  if (!missing.length) return null;

  return (
    <div className="req-list" data-testid="requirement-list">
      <div className="req-list-title">{title}</div>
      <ul className="req-list-items">
        {missing.map((req) => (
          <li key={`${req.branch}-${req.level}`}>
            {branchLabel(req.branch, locale)} — {t('research.level', { level: req.level })}
          </li>
        ))}
      </ul>
    </div>
  );
};
