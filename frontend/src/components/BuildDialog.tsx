import React, { useState } from 'react';
import type { BuildingType, BuildBlockedReason } from '@shared/types/buildings';
import { formatBuildBlockedMessage } from '@shared/types/building-eligibility';
import { resolveBuildingType } from './cosmic/buildings';
import { getResourceSymbol } from './cosmic/resources';

interface BuildDialogProps {
  types: BuildingType[];
  isOpen: boolean;
  onClose: () => void;
  onAction: (typeId: string) => void;
  isProcessing: boolean;
  /** Server/catalog-driven eligibility (grey-out + tap for reason). */
  blockedReasonFor?: (typeId: string) => BuildBlockedReason | null;
  /**
   * Optional accent override — typically the active planet's biome accent.
   * Defaults to the cyan Atlas accent.
   */
  accent?: string;
  /** Optional planet biome label, surfaced in the sheet subtitle. */
  planetLabel?: string;
}

/**
 * Bottom-sheet build dialog matching the Cosmic Atlas design.
 *
 * Behavioral notes:
 *  - The sheet is rendered as a portal-less fixed overlay so it can host the
 *    full list of building types with native scroll.
 *  - When `accent` is provided, the option icons are tinted with the biome
 *    color so the dialog reads as part of the current planet.
 */
export const BuildDialog: React.FC<BuildDialogProps> = ({
  types,
  isOpen,
  onClose,
  onAction,
  isProcessing,
  blockedReasonFor,
  accent = '#5BD7FF',
  planetLabel,
}) => {
  const [explainedReason, setExplainedReason] = useState<BuildBlockedReason | null>(null);

  if (!isOpen) return null;

  const lang: 'en' | 'ru' = 'en';

  return (
    <div
      className="bd-backdrop"
      role="presentation"
      onClick={() => {
        setExplainedReason(null);
        onClose();
      }}
      style={{ '--accent': accent } as React.CSSProperties}
    >
      <div
        className="bd-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Construct building"
        data-testid="build-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ '--accent': accent } as React.CSSProperties}
      >
        <div className="bd-handle" />
        <div className="bd-head">
          <div className="bd-tag">SELECT INSTALLATION</div>
          <div className="bd-title">Build on this slot</div>
          <div className="bd-sub">
            {planetLabel ? `${planetLabel} · tap an option to start construction` : 'Tap an option to start construction'}
          </div>
        </div>

        {explainedReason ? (
          <div className="bd-block-hint" role="status" data-testid="build-block-reason">
            <div className="bd-block-hint-text">{formatBuildBlockedMessage(explainedReason, lang)}</div>
            <button type="button" className="bd-block-hint-ok" onClick={() => setExplainedReason(null)}>
              OK
            </button>
          </div>
        ) : null}

        <div className="bd-list">
          {types.map((type) => {
            const def = resolveBuildingType(type.id);
            const costs = Object.entries(type.baseCost);
            const minutes = Math.floor(type.baseTimeSec / 60);
            const seconds = type.baseTimeSec % 60;
            const blocked = blockedReasonFor?.(type.id) ?? null;
            const locked = Boolean(blocked);
            return (
              <button
                key={type.id}
                type="button"
                className={`bopt${locked ? ' locked' : ''}`}
                onClick={() => {
                  if (isProcessing) return;
                  if (locked && blocked) {
                    setExplainedReason(blocked);
                    return;
                  }
                  onAction(type.id);
                }}
                disabled={isProcessing}
                data-testid={`build-option-${type.id}`}
                aria-disabled={locked || isProcessing}
              >
                <div className="bopt-icon">
                  <def.Icon size={32} tone={accent} />
                </div>
                <div>
                  <div className="bopt-row">
                    <span className="bopt-name">{type.name.en}</span>
                    <span className="bopt-locked">{type.category.toUpperCase()}</span>
                  </div>
                  <div className="bopt-meta">
                    <span className="bopt-cost">
                      {costs.length === 0
                        ? '—'
                        : costs
                            .map(([resId, amount]) => `${getResourceSymbol(resId)} ${amount}`)
                            .join('  ·  ')}
                    </span>
                    <span className="bopt-time">
                      {minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, '0')}s` : `${seconds}s`}
                    </span>
                  </div>
                </div>
                <span aria-hidden="true" style={{ color: 'var(--text-faint)' }}>›</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
