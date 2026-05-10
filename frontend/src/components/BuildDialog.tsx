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
  currentEnergy?: {
    produced: number;
    consumed: number;
  };
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
  currentEnergy,
}) => {
  const [explainedReason, setExplainedReason] = useState<BuildBlockedReason | null>(null);

  if (!isOpen) return null;

  const lang: 'en' | 'ru' = 'en';
  const sortedTypes = [...types].sort((a, b) => {
    const aGate = (a.deps ?? []).reduce((max, dep) => Math.max(max, dep.level), 0);
    const bGate = (b.deps ?? []).reduce((max, dep) => Math.max(max, dep.level), 0);
    if (aGate !== bGate) return aGate - bGate;
    if ((a.deps?.length ?? 0) !== (b.deps?.length ?? 0)) {
      return (a.deps?.length ?? 0) - (b.deps?.length ?? 0);
    }
    return a.baseTimeSec - b.baseTimeSec || a.name.en.localeCompare(b.name.en);
  });
  const producedNow = currentEnergy?.produced ?? 0;
  const consumedNow = currentEnergy?.consumed ?? 0;
  const netNow = producedNow - consumedNow;

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
          {currentEnergy ? (
            <div className="bd-sub" style={{ marginTop: 6 }}>
              Energy now: +{producedNow} / -{consumedNow} (net {netNow >= 0 ? '+' : ''}{netNow})
            </div>
          ) : null}
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
          {sortedTypes.map((type) => {
            const def = resolveBuildingType(type.id);
            const costs = Object.entries(type.baseCost);
            const minutes = Math.floor(type.baseTimeSec / 60);
            const seconds = type.baseTimeSec % 60;
            const blocked = blockedReasonFor?.(type.id) ?? null;
            const locked = Boolean(blocked);
            const output = type.baseOutput;
            const projectedProduced = producedNow + (output.energy ?? 0);
            const projectedConsumed = consumedNow + Math.max(0, type.energyConsumption ?? 0);
            const projectedNet = projectedProduced - projectedConsumed;
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
                  <div className="bopt-desc">{type.description.en}</div>
                  <div className="bopt-stats">
                    {output.resourceId && output.baseRate && (
                      <span className="bstat">
                        Yield: +{output.baseRate} {getResourceSymbol(output.resourceId)}/h
                      </span>
                    )}
                    {output.cap && (
                      <span className="bstat">
                        Capacity: +{output.cap}
                      </span>
                    )}
                    {output.energy && (
                      <span className="bstat energy">
                        Energy: +{output.energy}
                      </span>
                    )}
                    {type.energyConsumption > 0 && (
                      <span className="bstat neg">
                        Usage: -{type.energyConsumption} E
                      </span>
                    )}
                    {currentEnergy && (
                      <span className={`bstat ${projectedNet < 0 ? 'neg' : 'energy'}`}>
                        Net after build: {projectedNet >= 0 ? '+' : ''}{projectedNet} E
                      </span>
                    )}
                    {output.conversion && (
                      <span className="bstat">
                        {getResourceSymbol(output.conversion.from)} → {getResourceSymbol(output.conversion.to)} ({output.conversion.rate}/h)
                      </span>
                    )}
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
