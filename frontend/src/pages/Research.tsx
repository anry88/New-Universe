import React, { useEffect, useState } from 'react';
import { useMe } from '../hooks/useMe';
import { useRushResearch, useStartResearch } from '../hooks/useResearch';
import { TECH_TREE_DATA, BRANCHES, RESEARCH_MAX_LEVEL, type TechTreeEntry } from '../lib/tech-tree';
import { evaluateResearchEligibility } from '../lib/research-eligibility';
import { ResourceBar } from '../components/ResourceBar';
import { RequirementList } from '../components/RequirementList';
import { ResearchQueue } from '../components/ResearchQueue';
import { TechTreeNode, type TechTreeNodeVisualState } from '../components/TechTreeNode';
import { CosmicBackground, CosmicBottomNav } from '../components/cosmic/atoms';
import { ChevronLeft, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getResourceSymbol } from '../components/cosmic/resources';
import { resolveBuildingType } from '../components/cosmic/buildings';
import { estimateRushDiamondCost } from '@shared/types/diamonds';
import { formatTimerDuration, timerSnapshot } from '../lib/timers';
import { useI18n } from '../lib/i18n';
import { getActiveResearch, researchStartBlockedByActive } from '../lib/research-queue';

const BRANCH_COLORS: Record<string, string> = {
  mining: '#C7A582',
  engineering: '#5BD7FF',
  engines: '#9FE0B5',
  energy: '#F4D35E',
  sensors: '#E0B0FF',
  logistics: '#7DD8E8',
  jump_drive: '#F4B84A',
};

type DetailPanel = null | { kind: 'tier'; def: TechTreeEntry } | { kind: 'complete'; branchId: string };

function tierVisual(level: number, completedLevel: number, completesAt: string | null | undefined): TechTreeNodeVisualState {
  const now = Date.now();
  const timerActive = Boolean(completesAt && new Date(completesAt).getTime() > now);
  if (completedLevel >= level) return 'completed';
  if (timerActive && completedLevel === level - 1) return 'active';
  if (!timerActive && completedLevel === level - 1) return 'pending';
  return 'locked';
}

function formatEffectLines(effects: TechTreeEntry['effects'], t: (key: string, params?: Record<string, string | number>) => string): string {
  if (!effects.length) return t('research.passive');
  return effects
    .map((e) => {
      const label = t(`research.effect.${e.target}`);
      if (e.multiplier < 1) {
        return `${label}: x${e.multiplier.toFixed(2)} (${t('research.reduction')})`;
      }
      const pct = Math.round((e.multiplier - 1) * 100);
      return `${label}: +${pct}%`;
    })
    .join(' · ');
}

const TIER_LEVELS = Array.from({ length: RESEARCH_MAX_LEVEL }, (_, i) => (i + 1) as 1 | 2 | 3 | 4 | 5);

function researchActionError(error: unknown, fallback: string, t: (key: string) => string): string {
  const message = error instanceof Error ? error.message : fallback;
  if (message === 'Research queue is busy') return t('research.queueBusyError');
  return message;
}

export function ResearchPage() {
  const { data: meData } = useMe();
  const startResearch = useStartResearch();
  const rushResearch = useRushResearch();
  const navigate = useNavigate();
  const { locale, t } = useI18n();
  const [panel, setPanel] = useState<DetailPanel>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const homePlanet = meData?.homeSystem?.planets?.[0];
  const homePlanetId = homePlanet?.id;
  const homePlanetResources = homePlanet?.resources;
  const activeResearch = getActiveResearch(meData?.research);
  const activeResearchDef = activeResearch ? TECH_TREE_DATA.find((entry) => entry.branch === activeResearch.branch && entry.level === activeResearch.level + 1) : undefined;

  const labBuilding = homePlanet?.buildings?.find((b) => {
    const def = resolveBuildingType(b.typeId);
    return def === resolveBuildingType('lab');
  });
  const labLevel = labBuilding?.level ?? 0;

  const handleStart = async (def: TechTreeEntry) => {
    if (!homePlanetId) return;
    const queueBlock = researchStartBlockedByActive(def.branch, meData?.research);
    if (queueBlock) {
      setActionError(t('research.queueBusyError'));
      return;
    }
    setActionError(null);
    try {
      await startResearch.mutateAsync({
        branch: def.branch,
        planetId: homePlanetId,
        estimatedDurationSec: def.timeSec,
      });
      setPanel(null);
    } catch (e: unknown) {
      setActionError(researchActionError(e, t('research.couldNotStart'), t));
    }
  };

  const handleRush = async (branch: string) => {
    setActionError(null);
    try {
      await rushResearch.mutateAsync(branch);
      setPanel(null);
    } catch (e: unknown) {
      setActionError(researchActionError(e, t('research.couldNotRush'), t));
    }
  };

  return (
    <div className="cosmic-screen" style={{ '--accent': '#5BD7FF' } as React.CSSProperties}>
      <CosmicBackground accent="#5BD7FF" starSeed={42} />

      <ResourceBar planetId={homePlanetId} />

      <div className="page-head" style={{ position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" aria-label={t('common.back')} onClick={() => navigate('/')} style={{ padding: 4, borderRadius: 999, color: 'var(--text-dim)' }}>
            <ChevronLeft size={20} />
          </button>
          <div>
            <div className="page-tag">{t('research.labTag', { level: labLevel }).toUpperCase()}</div>
            <div className="page-title">{t('research.title')}</div>
          </div>
        </div>
        <div className="page-stat">
          <div className="ps-v">{activeResearch ? '1/1' : '0/1'}</div>
          <div className="ps-l">{t('research.queue').toUpperCase()}</div>
        </div>
      </div>

      <div className="cosmic-scroll">
        <div className="tech-list">
          {BRANCHES.map((branch) => {
            const progress = meData?.research?.find((p) => p.branch === branch.id);
            const completedLevel = progress?.level ?? 0;
            const accent = BRANCH_COLORS[branch.id] ?? '#5BD7FF';

            const nextDef = TECH_TREE_DATA.find((t) => t.branch === branch.id && t.level === completedLevel + 1);

            const openNextPanel = () => {
              if (completedLevel >= RESEARCH_MAX_LEVEL) {
                setPanel({ kind: 'complete', branchId: branch.id });
                return;
              }
              if (nextDef) setPanel({ kind: 'tier', def: nextDef });
            };

            return (
              <div key={branch.id} className="tech-row" style={{ '--accent': accent } as React.CSSProperties}>
                <div
                  className="tech-row-head tech-row-head--action"
                  role="button"
                  tabIndex={0}
                  onClick={openNextPanel}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openNextPanel();
                    }
                  }}
                >
                  <div className="tech-name" style={{ color: 'var(--text)' }}>
                    <span className="tech-dot" style={{ background: accent, color: accent }} />
                    {branch.name[locale]}
                  </div>
                  <div className="tech-lvl">
                    {Math.min(completedLevel, RESEARCH_MAX_LEVEL)}
                    <span className="tech-max"> / {RESEARCH_MAX_LEVEL}</span>
                  </div>
                </div>
                <div className="tech-branch-desc">{branch.description[locale]}</div>
                <div className="tech-nodes">
                  {TIER_LEVELS.map((level) => {
                    const tierDef = TECH_TREE_DATA.find((t) => t.branch === branch.id && t.level === level);
                    const vis = tierVisual(level, completedLevel, progress?.completesAt ?? null);
                    const dur = tierDef?.timeSec;
                    return (
                      <button
                        key={level}
                        type="button"
                        className="tech-node-hitbox"
                        aria-label={t('research.tierDetails', { level })}
                        disabled={!tierDef}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (tierDef) setPanel({ kind: 'tier', def: tierDef });
                        }}
                      >
                        <TechTreeNode
                          level={level}
                          accent={accent}
                          visual={vis}
                          tierDefinition={tierDef}
                          completesAt={progress?.completesAt}
                          startedAt={progress?.startedAt}
                          durationSec={vis === 'active' && tierDef ? dur : undefined}
                        />
                      </button>
                    );
                  })}
                </div>
                <div className="qstrip-bar">
                  <div
                    className="qstrip-fill"
                    style={{
                      width: `${(Math.min(completedLevel, RESEARCH_MAX_LEVEL) / RESEARCH_MAX_LEVEL) * 100}%`,
                      background: accent,
                      boxShadow: `0 0 6px ${accent}`,
                    }}
                  />
                </div>
                {completedLevel > 0 && tierDefForCompleted(branch.id, completedLevel) && (
                  <div className="tech-effect-line">
                    {t('research.applied', {
                      effects: formatEffectLines(tierDefForCompleted(branch.id, completedLevel)!.effects, t),
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="fixed-bottom-ui">
        <ResearchQueue research={meData?.research} rushPricing={meData?.rushPricing ?? null} diamondBalance={meData?.diamonds ?? 0} />
        <CosmicBottomNav />
      </div>

      {panel?.kind === 'tier' && (
        <TierDetailSheet
          def={panel.def}
          labLevel={labLevel}
          research={meData?.research}
          planetResources={homePlanetResources}
          startResearch={startResearch}
          rushResearch={rushResearch}
          diamondBalance={meData?.diamonds ?? 0}
          rushPricing={meData?.rushPricing ?? null}
          activeResearchBranch={activeResearch?.branch ?? null}
          activeResearchName={activeResearchDef?.name[locale] ?? activeResearch?.branch ?? null}
          error={actionError}
          onClose={() => setPanel(null)}
          onStart={() => handleStart(panel.def)}
          onRush={() => handleRush(panel.def.branch)}
        />
      )}

      {panel?.kind === 'complete' && (
        <div className="bd-backdrop" onClick={() => setPanel(null)}>
          <div className="bd-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="bd-handle" />
            <div className="bd-head" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div className="bd-tag">{t('research.branchComplete').toUpperCase()}</div>
                <div className="bd-title">{BRANCHES.find((b) => b.id === panel.branchId)?.name[locale] ?? panel.branchId}</div>
                <div className="bd-sub">{t('research.allTiers', { count: RESEARCH_MAX_LEVEL })}</div>
              </div>
              <button type="button" aria-label={t('common.close')} onClick={() => setPanel(null)} style={{ color: 'var(--text-faint)' }}>
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function tierDefForCompleted(branchId: string, completedLevel: number): TechTreeEntry | undefined {
  return TECH_TREE_DATA.find((t) => t.branch === branchId && t.level === completedLevel);
}

interface TierDetailSheetProps {
  def: TechTreeEntry;
  labLevel: number;
  research: import('@shared/types/user').User['research'];
  planetResources: import('@shared/types/world').PlanetResource[] | undefined;
  startResearch: ReturnType<typeof useStartResearch>;
  rushResearch: ReturnType<typeof useRushResearch>;
  diamondBalance: number;
  rushPricing: import('@shared/types/diamonds').RushPricing | null;
  activeResearchBranch: string | null;
  activeResearchName: string | null;
  error: string | null;
  onClose: () => void;
  onStart: () => void;
  onRush: () => void;
}

function TierDetailSheet({
  def,
  labLevel,
  research,
  planetResources,
  startResearch,
  rushResearch,
  diamondBalance,
  rushPricing,
  activeResearchBranch,
  activeResearchName,
  error,
  onClose,
  onStart,
  onRush,
}: TierDetailSheetProps) {
  const { locale, t } = useI18n();
  const eligibility = evaluateResearchEligibility(def, labLevel, research, planetResources, locale);
  const activeProgress = research?.find((row) => row.branch === def.branch && row.level === def.level - 1 && row.completesAt && new Date(row.completesAt).getTime() > Date.now()) ?? null;
  const blockedByResearchQueue = Boolean(activeResearchBranch && activeResearchBranch !== def.branch && !activeProgress);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!activeProgress?.completesAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeProgress?.completesAt]);

  const activeTimer = activeProgress?.completesAt
    ? timerSnapshot({
        completesAt: activeProgress.completesAt,
        startedAt: activeProgress.startedAt,
        totalDurationSec: def.timeSec,
        nowMs: now,
      })
    : null;
  const rushCost = activeTimer && rushPricing ? estimateRushDiamondCost(activeTimer.remainingSec, rushPricing.diamondsPerMinute, rushPricing.maxPerAction) : 0;
  const canRush = Boolean(activeTimer && rushPricing) && diamondBalance >= rushCost;

  return (
    <div className="bd-backdrop" onClick={onClose}>
      <div className="bd-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="bd-handle" />
        <div
          className="bd-head"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div className="bd-tag">{t('research.active').toUpperCase()}</div>
            <div className="bd-title">{def.name[locale]}</div>
            <div className="bd-sub">
              {t('research.levelBranch', {
                level: def.level,
                branch: def.branch,
              })}
            </div>
          </div>
          <button type="button" aria-label={t('common.close')} onClick={onClose} style={{ color: 'var(--text-faint)' }}>
            <X size={18} />
          </button>
        </div>
        <div className="bd-list">
          <p
            style={{
              color: 'var(--text-dim)',
              fontSize: 13,
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {def.description[locale]}
          </p>

          <div className="tech-effect-block">
            <div className="tech-effect-label">{t('research.effects')}</div>
            <div className="tech-effect-body">{formatEffectLines(def.effects, t)}</div>
          </div>

          {activeTimer && (
            <div className="tech-effect-block">
              <div className="tech-effect-label">{t('research.activeResearch')}</div>
              <div className="tech-effect-body">
                {t('research.remaining', {
                  time: formatTimerDuration(activeTimer.remainingSec),
                })}
              </div>
              <div className="qstrip-bar" style={{ marginTop: 8 }}>
                <div
                  className="qstrip-fill"
                  style={{
                    width: `${activeTimer.progressPct}%`,
                    background: 'var(--accent)',
                    boxShadow: '0 0 6px var(--accent)',
                  }}
                />
              </div>
            </div>
          )}

          {!activeTimer && blockedByResearchQueue && (
            <div className="tech-lock-block" data-testid="research-queue-block">
              <div className="tech-effect-label">{t('research.queueBusy')}</div>
              <p className="tech-lock-line">
                {t('research.queueBusyDetail', {
                  name: activeResearchName ?? activeResearchBranch ?? '',
                })}
              </p>
            </div>
          )}

          {!activeTimer && !eligibility.ok && (
            <div className="tech-lock-block">
              <div className="tech-effect-label">{t('research.blocked')}</div>
              {eligibility.labMessage && <p className="tech-lock-line">{eligibility.labMessage}</p>}
              {eligibility.resourceMessage && (
                <p className="tech-lock-line" data-testid="research-block-resources">
                  {t('research.needResources', {
                    resources: eligibility.resourceMessage,
                  })}
                </p>
              )}
              {eligibility.missingResearch.length > 0 && <RequirementList title={t('research.prerequisites')} missing={eligibility.missingResearch} locale={locale} />}
            </div>
          )}

          <div className={`bopt${!eligibility.ok || blockedByResearchQueue ? ' locked' : ''}`} style={{ cursor: 'default' }}>
            <div className="bopt-icon">
              <svg width="32" height="32" viewBox="0 0 64 64" fill="none" stroke="var(--accent)" strokeWidth="1.6">
                <path d="M26 10 L38 10" />
                <path d="M28 10 L28 26 L18 48 Q14 56 22 56 L42 56 Q50 56 46 48 L36 26 L36 10" />
              </svg>
            </div>
            <div>
              <div className="bopt-row">
                <span className="bopt-name">{t('common.cost')}</span>
                <span className="bopt-locked">L{def.level}</span>
              </div>
              <div className="bopt-meta">
                <span className="bopt-cost">
                  {Object.entries(def.cost)
                    .map(([res, amount]) => `${getResourceSymbol(res)} ${amount}`)
                    .join('  ·  ')}
                </span>
                <span className="bopt-time">{formatTimerDuration(def.timeSec)}</span>
              </div>
            </div>
            <span aria-hidden="true" />
          </div>

          {error && (
            <p style={{ color: '#ff8a8a', fontSize: 13, margin: 0 }} role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={activeTimer ? onRush : onStart}
            disabled={activeTimer ? rushResearch.isPending || !canRush : startResearch.isPending || !eligibility.ok || blockedByResearchQueue}
            className="cosmic-cta"
            style={{ width: '100%', padding: '14px', marginTop: 8 }}
          >
            {activeTimer
              ? rushResearch.isPending
                ? t('research.rushing')
                : !rushPricing
                  ? t('common.syncingPrice')
                  : canRush
                    ? t('research.finishNow', { cost: rushCost })
                    : t('research.needDiamonds', { cost: rushCost })
              : startResearch.isPending
                ? t('research.starting')
                : blockedByResearchQueue
                  ? t('research.queueBusyCta')
                  : eligibility.ok
                    ? t('research.initiate')
                    : t('common.locked')}
          </button>
        </div>
      </div>
    </div>
  );
}

export { TechTreeNode } from '../components/TechTreeNode';
