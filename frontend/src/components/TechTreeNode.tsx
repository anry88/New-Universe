import React, { useEffect, useState } from 'react';
import type { ResearchDefinition } from '@shared/types/research';

export type TechTreeNodeVisualState = 'completed' | 'active' | 'pending' | 'locked';

export interface TechTreeNodeProps {
  level: number;
  accent: string;
  visual: TechTreeNodeVisualState;
  tierDefinition?: ResearchDefinition;
  /** When visual === active — ISO date string */
  completesAt?: string | null;
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
  durationSec,
}: TechTreeNodeProps) {
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

  const progressPct =
    visual === 'active' && completesAt && durationSec
      ? Math.min(100, Math.max(0, 100 - (remainingMs / (durationSec * 1000)) * 100))
      : 0;

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
    tierDefinition?.description?.en ??
    (visual === 'locked' ? 'Requirements not met' : `Tier ${level}`);

  return (
    <div
      className={cls}
      style={style}
      title={title}
      role="img"
      aria-label={`Tier ${level} ${visual}`}
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
