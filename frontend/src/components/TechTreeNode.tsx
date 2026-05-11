import React, { useEffect, useState } from 'react';
import type { ResearchDefinition } from '@shared/types/research';
import { timerSnapshot } from '../lib/timers';
import { useI18n } from '../lib/i18n';

export type TechTreeNodeVisualState = 'completed' | 'active' | 'pending' | 'locked';

export interface TechTreeNodeProps {
  level: number;
  accent: string;
  visual: TechTreeNodeVisualState;
  tierDefinition?: ResearchDefinition;
  /** When visual === active — ISO date string */
  completesAt?: string | null;
  /** Server-derived tier start timestamp for exact progress fill. */
  startedAt?: string | null;
  /** Total scheduled duration for this tier (seconds), for progress fill */
  durationSec?: number;
}

/**
 * Single tier chip inside a branch row (Cosmic Atlas `tech-node` styles).
 */
export function TechTreeNode({
  level,
  accent,
  visual,
  tierDefinition,
  completesAt,
  startedAt,
  durationSec,
}: TechTreeNodeProps) {
  const { locale, t } = useI18n();
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (visual !== 'active' || !completesAt) return;

    const tick = () => {
      const end = new Date(completesAt).getTime();
      setRemainingMs(Math.max(0, end - Date.now()));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [visual, completesAt]);

  const snapshot =
    visual === 'active' && completesAt
      ? timerSnapshot({
          completesAt,
          startedAt,
          totalDurationSec: durationSec,
        })
      : null;
  const progressPct = snapshot?.progressPct ?? 0;

  const cls =
    'tech-node' +
    (visual === 'completed' ? ' done' : '') +
    (visual === 'active' ? ' active' : '') +
    (visual === 'locked' ? ' locked' : '');

  const style: React.CSSProperties =
    visual === 'completed'
      ? { background: accent, color: '#02101a', borderColor: accent }
      : visual === 'locked'
        ? { opacity: 0.35 }
        : {};

  const title =
    tierDefinition?.description?.[locale] ??
    (visual === 'locked' ? t('research.requirementsNotMet') : t('research.tier', { level }));

  return (
    <div
      className={cls}
      style={style}
      title={title}
      role="img"
      aria-label={`${t('research.tier', { level })} ${visual}`}
    >
      <span style={{ position: 'relative', zIndex: 1 }}>{level}</span>
      {visual === 'active' && remainingMs > 0 && (
        <span
          style={{
            position: 'absolute',
            bottom: 2,
            left: 4,
            right: 4,
            fontSize: 8,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-dim)',
            textAlign: 'center',
            zIndex: 1,
          }}
        >
          {Math.ceil(remainingMs / 1000)}s
        </span>
      )}
      {visual === 'active' && durationSec ? (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            height: 3,
            width: `${progressPct}%`,
            background: accent,
            borderRadius: '0 0 4px 4px',
            opacity: 0.85,
          }}
        />
      ) : null}
    </div>
  );
}
