import React from 'react';
import type { BuildingType } from '@shared/types/buildings';
import { resolveBuildingType } from './cosmic/buildings';
import { getResourceSymbol } from './cosmic/resources';

interface BuildDialogProps {
  types: BuildingType[];
  isOpen: boolean;
  onClose: () => void;
  onAction: (typeId: string) => void;
  isProcessing: boolean;
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
  accent = '#5BD7FF',
  planetLabel,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="bd-backdrop"
      role="presentation"
      onClick={onClose}
      style={{ '--accent': accent } as React.CSSProperties}
    >
      <div
        className="bd-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Construct building"
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

        <div className="bd-list">
          {types.map((type) => {
            const def = resolveBuildingType(type.id);
            const costs = Object.entries(type.baseCost);
            const minutes = Math.floor(type.baseTimeSec / 60);
            const seconds = type.baseTimeSec % 60;
            return (
              <button
                key={type.id}
                type="button"
                className="bopt"
                onClick={() => onAction(type.id)}
                disabled={isProcessing}
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
