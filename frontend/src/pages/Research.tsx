import React, { useState } from 'react';
import { useMe } from '../hooks/useMe';
import { useStartResearch } from '../hooks/useResearch';
import { TECH_TREE_DATA, BRANCHES } from '../lib/tech-tree';
import { ResourceBar } from '../components/ResourceBar';
import {
  CosmicBackground,
  CosmicBottomNav,
} from '../components/cosmic/atoms';
import { ChevronLeft, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ResearchDefinition } from '@shared/types/research';
import { getResourceSymbol } from '../components/cosmic/resources';
import { resolveBuildingType } from '../components/cosmic/buildings';

const BRANCH_COLORS: Record<string, string> = {
  mining: '#C7A582',
  engineering: '#5BD7FF',
  engines: '#9FE0B5',
  weapons: '#FF5A6E',
  sensors: '#E0B0FF',
  logistics: '#7DD8E8',
  jump_drive: '#F4B84A',
};

/**
 * Research / Tech-Tree screen — Cosmic Atlas redesign.
 *
 * Each branch is rendered as a horizontal "tech-row" card showing:
 *   - branch dot + name + current level / max
 *   - 5 node squares (one per level), each marked done / active / pending
 *   - bottom progress bar reflecting current level
 *
 * Tapping a row opens a bottom-sheet detail pane (when a definition exists
 * for the next level) so the user can start research.
 */
export function ResearchPage() {
  const { data: meData } = useMe();
  const startResearch = useStartResearch();
  const navigate = useNavigate();
  const [selectedTech, setSelectedTech] = useState<ResearchDefinition | null>(null);

  const homePlanetId = meData?.homeSystem?.planets?.[0]?.id;

  // Use the resolved Lab building (handles legacy `research_lab` alias too).
  const labBuilding = meData?.homeSystem?.planets?.[0]?.buildings?.find((b) => {
    const def = resolveBuildingType(b.typeId);
    return def === resolveBuildingType('lab');
  });
  const labLevel = labBuilding?.level ?? 0;

  const handleStart = async () => {
    if (!selectedTech || !homePlanetId) return;
    try {
      await startResearch.mutateAsync({ branch: selectedTech.branch, planetId: homePlanetId });
      setSelectedTech(null);
    } catch (err) {
      console.error(err);
    }
  };

  const levels = [1, 2, 3, 4, 5];

  return (
    <div className="cosmic-screen" style={{ '--accent': '#5BD7FF' } as React.CSSProperties}>
      <CosmicBackground accent="#5BD7FF" starSeed={42} />

      <ResourceBar planetId={homePlanetId} />

      <div className="page-head" style={{ position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            aria-label="Back"
            onClick={() => navigate('/')}
            style={{ padding: 4, borderRadius: 999, color: 'var(--text-dim)' }}
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <div className="page-tag">RESEARCH LAB · L{labLevel}</div>
            <div className="page-title">Tech Tree</div>
          </div>
        </div>
        <div className="page-stat">
          <div className="ps-v">{meData?.research?.length ?? 0}</div>
          <div className="ps-l">BRANCHES</div>
        </div>
      </div>

      <div className="cosmic-scroll">
        <div className="tech-list">
          {BRANCHES.map((branch) => {
            const progress = meData?.research?.find((p) => p.branch === branch.id);
            const currentLevel = progress?.level || 0;
            const accent = BRANCH_COLORS[branch.id] ?? '#5BD7FF';

            // Pick the next-level definition the player can start.
            const nextDef = TECH_TREE_DATA.find(
              (t) => t.branch === branch.id && t.level === currentLevel + 1
            );

            const onClick = () => {
              if (nextDef) setSelectedTech(nextDef);
            };

            return (
              <button
                key={branch.id}
                type="button"
                className="tech-row"
                onClick={onClick}
                style={{ '--accent': accent } as React.CSSProperties}
              >
                <div className="tech-row-head">
                  <div className="tech-name" style={{ color: 'var(--text)' }}>
                    <span className="tech-dot" style={{ background: accent, color: accent }} />
                    {branch.name.en}
                  </div>
                  <div className="tech-lvl">
                    {currentLevel}
                    <span className="tech-max"> / 5</span>
                  </div>
                </div>
                <div className="tech-nodes">
                  {levels.map((level) => {
                    const done = level <= currentLevel;
                    const active = level === currentLevel + 1 && Boolean(nextDef);
                    return (
                      <div
                        key={level}
                        className={'tech-node ' + (done ? 'done' : active ? 'active' : '')}
                        style={done ? { background: accent, color: '#02101a' } : undefined}
                      >
                        {level}
                      </div>
                    );
                  })}
                </div>
                <div className="qstrip-bar">
                  <div
                    className="qstrip-fill"
                    style={{
                      width: (currentLevel / 5) * 100 + '%',
                      background: accent,
                      boxShadow: `0 0 6px ${accent}`,
                    }}
                  />
                </div>
              </button>
            );
          })}
          <div style={{ height: 80 }} />
        </div>
      </div>

      <CosmicBottomNav active="tech" />

      {selectedTech && (
        <div className="bd-backdrop" onClick={() => setSelectedTech(null)}>
          <div className="bd-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="bd-handle" />
            <div className="bd-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="bd-tag">START RESEARCH</div>
                <div className="bd-title">{selectedTech.name.en}</div>
                <div className="bd-sub">Level {selectedTech.level} · {selectedTech.branch}</div>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSelectedTech(null)}
                style={{ color: 'var(--text-faint)' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="bd-list">
              <p style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                {selectedTech.description.en}
              </p>
              <div className="bopt" style={{ cursor: 'default' }}>
                <div className="bopt-icon">
                  <svg width="32" height="32" viewBox="0 0 64 64" fill="none" stroke="var(--accent)" strokeWidth="1.6">
                    <path d="M26 10 L38 10" />
                    <path d="M28 10 L28 26 L18 48 Q14 56 22 56 L42 56 Q50 56 46 48 L36 26 L36 10" />
                  </svg>
                </div>
                <div>
                  <div className="bopt-row">
                    <span className="bopt-name">Cost</span>
                    <span className="bopt-locked">L{selectedTech.level}</span>
                  </div>
                  <div className="bopt-meta">
                    <span className="bopt-cost">
                      {Object.entries(selectedTech.cost)
                        .map(([res, amount]) => `${getResourceSymbol(res)} ${amount}`)
                        .join('  ·  ')}
                    </span>
                    <span className="bopt-time">{selectedTech.timeSec}s</span>
                  </div>
                </div>
                <span aria-hidden="true" />
              </div>
              <button
                type="button"
                onClick={handleStart}
                disabled={startResearch.isPending}
                className="cosmic-cta"
                style={{ width: '100%', padding: '14px', marginTop: 8 }}
              >
                {startResearch.isPending ? 'Starting…' : 'Initiate Research'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Keep TechTreeNode export to avoid breaking any other usage. The new page
// renders a row layout, so the old tile component is unused but preserved.
export { TechTreeNode } from '../components/TechTreeNode';
