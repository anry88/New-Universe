import React from 'react';
import type { Building, Planet } from '@shared/types/world';
import type { BuildingType, BuildBlockedReason } from '@shared/types/buildings';
import {
  formatBuildBlockedMessage,
  resolveBuildingProductionRateForResource,
} from '@shared/types/building-eligibility';
import {
  buildingUpgradeResourceCosts,
  buildingUpgradeTimeSeconds,
} from '@shared/config/buildingUpgradeEconomy';
import { buildingEnergyOutputForLevel } from '@shared/config/planetEnergy';
import { getBuildingCategory, resolveBuildingType } from './cosmic/buildings';
import { getResourceLabel, ResourceAmount, ResourceAmountList, ResourceIcon } from './cosmic/resources';
import { useI18n } from '../lib/i18n';
import type { BuildDialogResourceChoice } from './BuildDialog';
import { recipesForBuildingType } from '@shared/config/productionRecipes';

function formatEnergyAmount(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

interface UpgradeDialogProps {
  building?: Building;
  typeInfo?: BuildingType;
  isOpen: boolean;
  onClose: () => void;
  onAction: (buildingId: string) => void;
  onDemolish: (buildingId: string) => void;
  onOpenShipyard?: () => void;
  onOpenProduction?: () => void;
  resourceChoices?: BuildDialogResourceChoice[];
  resourceSwitchBlockedReason?: (resourceId: string) => BuildBlockedReason | null;
  upgradeBlockedReason?: BuildBlockedReason | null;
  /**
   * Pre-localized message that disables the demolish button. Use when the
   * action would be rejected by the backend (queued building, spaceport with
   * docked ships or active reservations).
   */
  demolishBlockedMessage?: string | null;
  onChangeResource?: (buildingId: string, resourceId: string) => void;
  isProcessing: boolean;
  /** Biome accent override; defaults to Atlas cyan. */
  accent?: string;
  /** Energy anomaly worlds waive operational energy demand. */
  energyFree?: boolean;
  /** Current planet energy state, shown only for battery installations. */
  currentEnergy?: {
    produced: number;
    consumed: number;
    stored?: number;
    capacity?: number;
    net?: number;
  };
  /** Active planet context for planet-scaled previews such as wind output. */
  planet?: Pick<Planet, 'id' | 'name' | 'biome' | 'size' | 'orbitIndex'>;
}

/**
 * Bottom-sheet upgrade dialog using the Cosmic Atlas design language.
 * Cost and time previews use the shared upgrade-economy helpers so they stay
 * aligned with backend spending.
 */
export const UpgradeDialog: React.FC<UpgradeDialogProps> = ({
  building,
  typeInfo,
  isOpen,
  onClose,
  onAction,
  onDemolish,
  onOpenShipyard,
  onOpenProduction,
  resourceChoices = [],
  resourceSwitchBlockedReason,
  upgradeBlockedReason = null,
  demolishBlockedMessage = null,
  onChangeResource,
  isProcessing,
  accent = '#5BD7FF',
  energyFree = false,
  currentEnergy,
  planet,
}) => {
  const [explainedReason, setExplainedReason] = React.useState<BuildBlockedReason | null>(null);
  const { locale, t } = useI18n();
  if (!isOpen || !building || !typeInfo) return null;

  const def = resolveBuildingType(typeInfo.id);
  const costs = Object.entries(buildingUpgradeResourceCosts({
    typeId: typeInfo.id,
    baseCost: typeInfo.baseCost,
    currentLevel: building.level,
  })).map(([resId, amount]) => ({
    resId,
    amount,
  }));
  const buildTime = buildingUpgradeTimeSeconds(typeInfo.baseTimeSec, building.level);
  const minutes = Math.floor(buildTime / 60);
  const seconds = buildTime % 60;
  const producedNow = currentEnergy?.produced ?? 0;
  const consumedNow = currentEnergy?.consumed ?? 0;
  const netNow = currentEnergy?.net ?? producedNow - consumedNow;

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
        aria-label={t('build.upgradeAria', { name: typeInfo.name[locale] })}
        onClick={(e) => e.stopPropagation()}
        style={{ '--accent': accent } as React.CSSProperties}
      >
        <div className="bd-handle" />
        <div className="bd-head">
          <div className="bd-tag">{t('build.upgradeInstallation').toUpperCase()}</div>
          <div className="bd-title">{typeInfo.name[locale]}</div>
          <div className="bd-sub">
            L{building.level} → L{building.level + 1} · {getBuildingCategory(typeInfo.id, locale)}
          </div>
        </div>

        <div className="bd-list">
          {explainedReason ? (
            <div className="bd-block-hint" role="status" data-testid="extractor-resource-block-reason">
              <div className="bd-block-hint-text">{formatBuildBlockedMessage(explainedReason, locale)}</div>
              <button type="button" className="bd-block-hint-ok" onClick={() => setExplainedReason(null)}>
                {t('build.ok')}
              </button>
            </div>
          ) : null}

          {upgradeBlockedReason ? (
            <div className="bd-block-hint" role="status" data-testid="upgrade-block-reason">
              <div className="bd-block-hint-text">{formatBuildBlockedMessage(upgradeBlockedReason, locale)}</div>
            </div>
          ) : null}

          <div className="bopt" style={{ cursor: 'default' }}>
            <div className="bopt-icon">
              <def.Icon size={32} tone={accent} />
            </div>
            <div>
              <div className="bopt-row">
                <span className="bopt-name">{t('build.upgradeTo', { level: building.level + 1 })}</span>
                <span className="bopt-locked">{getBuildingCategory(typeInfo.id, locale).toUpperCase()}</span>
              </div>
              <div className="bopt-desc">{typeInfo.description[locale]}</div>

              {typeInfo.id === 'battery' && currentEnergy ? (
                <div className="bopt-energy-panel" role="status">
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

              {resourceChoices.length > 0 && onChangeResource ? (
                <div className="bopt-resource-row" aria-label={t('build.depositChoice')} style={{ marginTop: 10 }}>
                  {resourceChoices.map((choice) => {
                    const selected = choice.resourceId === building.selectedResourceId;
                    const blocked = selected ? null : resourceSwitchBlockedReason?.(choice.resourceId) ?? null;
                    const full = Boolean(blocked && blocked.code === 'building_blocked_deposit_limit');
                    return (
                      <button
                        key={choice.resourceId}
                        type="button"
                        className={`bopt-resource${selected ? ' selected' : ''}${full ? ' full' : ''}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (isProcessing || selected) return;
                          if (blocked) {
                            setExplainedReason(blocked);
                            return;
                          }
                          onChangeResource(building.id, choice.resourceId);
                        }}
                        disabled={isProcessing}
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
                {(() => {
                  const output = typeInfo.baseOutput;
                  const outputResourceId = building.selectedResourceId ?? output.resourceId;
                  const curLvl = building.level;
                  const nextLvl = curLvl + 1;
                  const outputRatePerLevel = outputResourceId && output.baseRate
                    ? resolveBuildingProductionRateForResource({
                        typeId: typeInfo.id,
                        baseOutput: output,
                        planetResourceIds: resourceChoices.length > 0
                          ? resourceChoices.map((choice) => choice.resourceId)
                          : [outputResourceId],
                        selectedResourceId: building.selectedResourceId,
                        resourceId: outputResourceId,
                      })
                    : 0;
                  const consumesEnergyOnlyDuringProcess = recipesForBuildingType(typeInfo.id).length > 0;
                  const idleEnergyConsumption = energyFree || consumesEnergyOnlyDuringProcess
                    ? 0
                    : typeInfo.energyConsumption;
                  const currentEnergyOutput = buildingEnergyOutputForLevel({
                    typeId: typeInfo.id,
                    baseEnergy: output.energy ?? 0,
                    level: curLvl,
                    planet,
                  });
                  const nextEnergyOutput = buildingEnergyOutputForLevel({
                    typeId: typeInfo.id,
                    baseEnergy: output.energy ?? 0,
                    level: nextLvl,
                    planet,
                  });
                  
                  return (
                    <>
                      {building.selectedResourceId && (
                        <span className="bstat">
                          {t('build.extracting')}: {getResourceLabel(building.selectedResourceId, locale)}
                        </span>
                      )}
                      {outputResourceId && outputRatePerLevel > 0 && (
                        <span className="bstat">
                          {t('build.yield')}:{' '}
                          <ResourceAmount
                            resourceId={outputResourceId}
                            amount={`${outputRatePerLevel * curLvl} → ${outputRatePerLevel * nextLvl}`}
                            suffix="/h"
                            iconSize={12}
                            locale={locale}
                          />
                        </span>
                      )}
                      {output.cap && (
                        <span className="bstat">
                          {t('build.capacity')}: {output.cap * curLvl} → {output.cap * nextLvl}
                        </span>
                      )}
                      {output.energyCap && (
                        <span className="bstat energy">
                          {t('build.energyCapacity')}: {output.energyCap * curLvl} → {output.energyCap * nextLvl} E
                        </span>
                      )}
                      {nextEnergyOutput > 0 && (
                        <span className="bstat energy">
                          {t('common.energy')}: {formatEnergyAmount(currentEnergyOutput)} → {formatEnergyAmount(nextEnergyOutput)}
                        </span>
                      )}
                      {idleEnergyConsumption > 0 && (
                        <span className="bstat neg">
                          {t('build.usage')}: -{idleEnergyConsumption} E
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
                    </>
                  );
                })()}
              </div>

              <div className="bopt-meta">
                <span className="bopt-cost">
                  {costs.length === 0
                    ? '—'
                    : (
                      <ResourceAmountList
                        items={costs.map(({ resId, amount }) => ({
                          resourceId: resId,
                          amount: amount.toLocaleString(),
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
            <span aria-hidden="true" />
          </div>

          <button
            type="button"
            onClick={() => onAction(building.id)}
            disabled={isProcessing || Boolean(upgradeBlockedReason)}
            className="cosmic-cta"
            style={{ width: '100%', padding: '14px', marginTop: '8px' }}
          >
            {isProcessing ? t('common.processing') : t('build.upgradeTo', { level: building.level + 1 })}
          </button>

          {typeInfo.id === 'shipyard' && onOpenShipyard && (
            <button
              type="button"
              onClick={onOpenShipyard}
              disabled={isProcessing}
              className="cosmic-cta"
              style={{ width: '100%', padding: '12px', marginTop: '10px' }}
            >
              {t('build.openShipConstruction')}
            </button>
          )}

          {onOpenProduction && (
            <button
              type="button"
              onClick={onOpenProduction}
              disabled={isProcessing}
              className="cosmic-cta"
              style={{ width: '100%', padding: '12px', marginTop: '10px' }}
            >
              {t('production.open')}
            </button>
          )}

          {demolishBlockedMessage ? (
            <div
              className="bd-block-hint"
              role="status"
              data-testid="demolish-block-reason"
              style={{ marginTop: 12 }}
            >
              <div className="bd-block-hint-text">{demolishBlockedMessage}</div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => onDemolish(building.id)}
            disabled={isProcessing || Boolean(demolishBlockedMessage)}
            className="cosmic-cta"
            style={{
              width: '100%',
              padding: '10px',
              marginTop: '12px',
              background: 'rgba(255, 80, 80, 0.1)',
              border: '1px solid rgba(255, 80, 80, 0.3)',
              color: '#FF8080',
              fontSize: '0.8rem',
            }}
          >
            {isProcessing ? t('common.processing') : t('build.demolish')}
          </button>
        </div>
      </div>
    </div>
  );
};
