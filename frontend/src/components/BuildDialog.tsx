import React, { useState } from 'react';
import type { BuildingType, BuildBlockedReason } from '@shared/types/buildings';
import type { Planet } from '@shared/types/world';
import {
  formatBuildBlockedMessage,
  resolveBuildingProductionRateForResource,
} from '@shared/types/building-eligibility';
import { buildingEnergyOutputForLevel } from '@shared/config/planetEnergy';
import {
  BUILDING_CATEGORY_ORDER,
  getBuildingCategoryKey,
  getBuildingCategoryLabel,
  resolveBuildingType,
  type BuildingCategoryKey,
} from './cosmic/buildings';
import { getResourceLabel, ResourceAmount, ResourceAmountList, ResourceIcon } from './cosmic/resources';
import { useI18n } from '../lib/i18n';
import { recipesForBuildingType } from '@shared/config/productionRecipes';

function formatEnergyAmount(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

export interface BuildDialogResourceChoice {
  resourceId: string;
  depositLimit: number;
  used: number;
}

interface BuildDialogProps {
  types: BuildingType[];
  isOpen: boolean;
  onClose: () => void;
  onAction: (typeId: string, selectedResourceId?: string | null) => void;
  isProcessing: boolean;
  /** Server/catalog-driven eligibility (grey-out + tap for reason). */
  blockedReasonFor?: (typeId: string, selectedResourceId?: string | null) => BuildBlockedReason | null;
  /** Planet-local extraction targets for mine/drill/pump-style buildings. */
  resourceChoicesFor?: (typeId: string) => BuildDialogResourceChoice[];
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
    stored?: number;
    capacity?: number;
    net?: number;
  };
  /** Energy anomaly worlds waive operational energy demand. */
  energyFree?: boolean;
  /** Active planet context for planet-scaled previews such as wind output. */
  planet?: Pick<Planet, 'id' | 'name' | 'biome' | 'size' | 'orbitIndex'>;
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
  resourceChoicesFor,
  accent = '#5BD7FF',
  currentEnergy,
  energyFree = false,
  planet,
}) => {
  const [explainedReason, setExplainedReason] = useState<BuildBlockedReason | null>(null);
  const [selectedResourceByType, setSelectedResourceByType] = useState<Record<string, string>>({});
  const { locale, t } = useI18n();

  if (!isOpen) return null;

  const sortedTypes = [...types].sort((a, b) => {
    const aGate = (a.deps ?? []).reduce((max, dep) => Math.max(max, dep.level), 0);
    const bGate = (b.deps ?? []).reduce((max, dep) => Math.max(max, dep.level), 0);
    if (aGate !== bGate) return aGate - bGate;
    if ((a.deps?.length ?? 0) !== (b.deps?.length ?? 0)) {
      return (a.deps?.length ?? 0) - (b.deps?.length ?? 0);
    }
    return a.baseTimeSec - b.baseTimeSec || a.name[locale].localeCompare(b.name[locale]);
  });
  const groupedTypes = sortedTypes.reduce<Array<{ key: BuildingCategoryKey; types: BuildingType[] }>>((groups, type) => {
    const key = getBuildingCategoryKey(type.id);
    const group = groups.find((entry) => entry.key === key);
    if (group) {
      group.types.push(type);
    } else {
      groups.push({ key, types: [type] });
    }
    return groups;
  }, []).sort((a, b) => BUILDING_CATEGORY_ORDER.indexOf(a.key) - BUILDING_CATEGORY_ORDER.indexOf(b.key));
  const producedNow = currentEnergy?.produced ?? 0;
  const consumedNow = currentEnergy?.consumed ?? 0;
  const netNow = currentEnergy?.net ?? producedNow - consumedNow;

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
        aria-label={t('build.constructAria')}
        data-testid="build-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ '--accent': accent } as React.CSSProperties}
      >
        <div className="bd-handle" />
        <div className="bd-head">
          <div className="bd-title">{t('build.constructAria')}</div>
        </div>

        {explainedReason ? (
          <div className="bd-block-hint" role="status" data-testid="build-block-reason">
            <div className="bd-block-hint-text">{formatBuildBlockedMessage(explainedReason, locale)}</div>
            <button type="button" className="bd-block-hint-ok" onClick={() => setExplainedReason(null)}>
              {t('build.ok')}
            </button>
          </div>
        ) : null}

        <div className="bd-list">
          {groupedTypes.map((group) => (
            <section className="bd-category" key={group.key}>
              <div className="bd-category-head">
                <span className="bd-category-title">{getBuildingCategoryLabel(group.key, locale)}</span>
                <span className="bd-category-count">{group.types.length}</span>
              </div>
              <div className="bd-category-list">
                {group.types.map((type) => {
                  const def = resolveBuildingType(type.id);
                  const costs = Object.entries(type.baseCost);
                  const minutes = Math.floor(type.baseTimeSec / 60);
                  const seconds = type.baseTimeSec % 60;
                  const resourceChoices = resourceChoicesFor?.(type.id) ?? [];
                  const defaultResourceId =
                    resourceChoices.find((choice) => choice.used < choice.depositLimit)?.resourceId ??
                    resourceChoices[0]?.resourceId ??
                    null;
                  const selectedResourceId = selectedResourceByType[type.id] ?? defaultResourceId;
                  const blocked = blockedReasonFor?.(type.id, selectedResourceId) ?? null;
                  const locked = Boolean(blocked);
                  const output = type.baseOutput;
                  const consumesEnergyOnlyDuringProcess = recipesForBuildingType(type.id).length > 0;
                  const idleEnergyConsumption = energyFree || consumesEnergyOnlyDuringProcess
                    ? 0
                    : Math.max(0, type.energyConsumption ?? 0);
                  const energyOutput = buildingEnergyOutputForLevel({
                    typeId: type.id,
                    baseEnergy: output.energy ?? 0,
                    level: 1,
                    planet,
                  });
                  const outputResourceId = selectedResourceId ?? output.resourceId;
                  const outputRate = outputResourceId && output.baseRate
                    ? resolveBuildingProductionRateForResource({
                        typeId: type.id,
                        baseOutput: output,
                        planetResourceIds: resourceChoices.length > 0
                          ? resourceChoices.map((choice) => choice.resourceId)
                          : [outputResourceId],
                        selectedResourceId,
                        resourceId: outputResourceId,
                      })
                    : 0;
                  const projectedProduced = producedNow + energyOutput;
                  const projectedConsumed = consumedNow + idleEnergyConsumption;
                  const projectedNet = projectedProduced - projectedConsumed;
                  return (
                    <div
                      key={type.id}
                      role="button"
                      tabIndex={isProcessing ? -1 : 0}
                      className={`bopt${locked ? ' locked' : ''}${isProcessing ? ' disabled' : ''}`}
                      onClick={() => {
                        if (isProcessing) return;
                        if (locked && blocked) {
                          setExplainedReason(blocked);
                          return;
                        }
                        onAction(type.id, selectedResourceId);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        if (isProcessing) return;
                        if (locked && blocked) {
                          setExplainedReason(blocked);
                          return;
                        }
                        onAction(type.id, selectedResourceId);
                      }}
                      data-testid={`build-option-${type.id}`}
                      aria-disabled={locked || isProcessing}
                    >
                      <div className="bopt-icon">
                        <def.Icon size={32} tone={accent} />
                      </div>
                      <div>
                        <div className="bopt-row">
                          <span className="bopt-name">{type.name[locale]}</span>
                          <span className="bopt-locked">{getBuildingCategoryLabel(group.key, locale).toUpperCase()}</span>
                        </div>
                        <div className="bopt-desc">{type.description[locale]}</div>
                        {type.id === 'battery' && currentEnergy ? (
                          <div className="bopt-energy-panel">
                            <span>
                              {t('build.energyNow', {
                                produced: producedNow,
                                consumed: consumedNow,
                                net: `${netNow >= 0 ? '+' : ''}${netNow}`,
                              })}
                            </span>
                            {typeof currentEnergy.stored === 'number' && typeof currentEnergy.capacity === 'number' ? (
                              <span>
                                {t('build.energyStored', {
                                  stored: currentEnergy.stored,
                                  capacity: currentEnergy.capacity,
                                })}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        {resourceChoices.length > 0 ? (
                          <div className="bopt-resource-row" aria-label={t('build.depositChoice')}>
                            {resourceChoices.map((choice) => {
                              const selected = choice.resourceId === selectedResourceId;
                              const full = choice.used >= choice.depositLimit;
                              return (
                                <button
                                  key={choice.resourceId}
                                  type="button"
                                  className={`bopt-resource${selected ? ' selected' : ''}${full ? ' full' : ''}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (isProcessing) return;
                                    setSelectedResourceByType((prev) => ({
                                      ...prev,
                                      [type.id]: choice.resourceId,
                                    }));
                                  }}
                                  disabled={isProcessing}
                                  data-resource-choice
                                  aria-pressed={selected}
                                  aria-label={`${getResourceLabel(choice.resourceId, locale)} ${choice.used}/${choice.depositLimit}`}
                                >
                                  <span className="bopt-resource-icon">
                                    <ResourceIcon resourceId={choice.resourceId} size={16} />
                                  </span>
                                  <span>{choice.used}/{choice.depositLimit}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                        <div className="bopt-stats">
                          {outputResourceId && outputRate > 0 && (
                            <span className="bstat">
                              {t('build.yield')}:{' '}
                              <ResourceAmount
                                resourceId={outputResourceId}
                                amount={`+${outputRate}`}
                                suffix="/h"
                                iconSize={12}
                                locale={locale}
                              />
                            </span>
                          )}
                          {output.cap && (
                            <span className="bstat">
                              {t('build.capacity')}: +{output.cap}
                            </span>
                          )}
                          {output.energyCap && (
                            <span className="bstat energy">
                              {t('build.energyCapacity')}: +{output.energyCap} E
                            </span>
                          )}
                          {energyOutput > 0 && (
                            <span className="bstat energy">
                              {t('common.energy')}: +{formatEnergyAmount(energyOutput)}
                            </span>
                          )}
                          {idleEnergyConsumption > 0 && (
                            <span className="bstat neg">
                              {t('build.usage')}: -{idleEnergyConsumption} E
                            </span>
                          )}
                          {currentEnergy && (
                            <span className={`bstat ${projectedNet < 0 ? 'neg' : 'energy'}`}>
                              {t('build.netAfter')}: {projectedNet >= 0 ? '+' : ''}{projectedNet} E
                            </span>
                          )}
                          {output.conversion && (
                            <span className="bstat">
                              <ResourceIcon
                                resourceId={output.conversion.from}
                                size={12}
                                title={getResourceLabel(output.conversion.from, locale)}
                              />{' '}
                              →{' '}
                              <ResourceIcon
                                resourceId={output.conversion.to}
                                size={12}
                                title={getResourceLabel(output.conversion.to, locale)}
                              />{' '}
                              ({output.conversion.rate}/h)
                            </span>
                          )}
                        </div>
                        <div className="bopt-meta">
                          <span className="bopt-cost">
                            {costs.length === 0
                              ? '—'
                              : (
                                <ResourceAmountList
                                  items={costs.map(([resourceId, amount]) => ({
                                    resourceId,
                                    amount,
                                  }))}
                                  locale={locale}
                                />
                              )}
                          </span>
                          <span className="bopt-time">
                            {minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, '0')}s` : `${seconds}s`}
                          </span>
                        </div>
                      </div>
                      <span aria-hidden="true" style={{ color: 'var(--text-faint)' }}>›</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};
