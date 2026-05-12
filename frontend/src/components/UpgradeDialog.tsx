import React from 'react';
import type { Building } from '@shared/types/world';
import type { BuildingType, BuildBlockedReason } from '@shared/types/buildings';
import { formatBuildBlockedMessage } from '@shared/types/building-eligibility';
import { getBuildingCategory, resolveBuildingType } from './cosmic/buildings';
import { getResourceLabel, getResourceSymbol } from './cosmic/resources';
import { useI18n } from '../lib/i18n';
import type { BuildDialogResourceChoice } from './BuildDialog';
import { recipesForBuildingType } from '@shared/config/productionRecipes';

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
  onChangeResource?: (buildingId: string, resourceId: string) => void;
  isProcessing: boolean;
  /** Biome accent override; defaults to Atlas cyan. */
  accent?: string;
}

/**
 * Bottom-sheet upgrade dialog using the Cosmic Atlas design language.
 * Cost scaling matches the existing client-side logic (×2 per level) so the
 * preview stays consistent with the legacy implementation until the backend
 * exposes a canonical "next-level cost" endpoint.
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
  onChangeResource,
  isProcessing,
  accent = '#5BD7FF',
}) => {
  const [explainedReason, setExplainedReason] = React.useState<BuildBlockedReason | null>(null);
  const { locale, t } = useI18n();
  if (!isOpen || !building || !typeInfo) return null;

  const def = resolveBuildingType(typeInfo.id);
  const multiplier = Math.pow(2, building.level);
  const costs = Object.entries(typeInfo.baseCost).map(([resId, amount]) => ({
    resId,
    amount: Math.floor(amount * multiplier),
  }));
  const buildTime = Math.floor(typeInfo.baseTimeSec * multiplier);
  const minutes = Math.floor(buildTime / 60);
  const seconds = buildTime % 60;

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
                        <span>{getResourceSymbol(choice.resourceId)}</span>
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
                  const consumesEnergyOnlyDuringProcess = recipesForBuildingType(typeInfo.id).length > 0;
                  const idleEnergyConsumption = consumesEnergyOnlyDuringProcess ? 0 : typeInfo.energyConsumption;
                  
                  return (
                    <>
                      {building.selectedResourceId && (
                        <span className="bstat">
                          {t('build.extracting')}: {getResourceLabel(building.selectedResourceId, locale)}
                        </span>
                      )}
                      {outputResourceId && output.baseRate && (
                        <span className="bstat">
                          {t('build.yield')}: {output.baseRate * curLvl} → {output.baseRate * nextLvl} {getResourceSymbol(outputResourceId)}/h
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
                      {output.energy && (
                        <span className="bstat energy">
                          {t('common.energy')}: {output.energy * curLvl} → {output.energy * nextLvl}
                        </span>
                      )}
                      {idleEnergyConsumption > 0 && (
                        <span className="bstat neg">
                          {t('build.usage')}: -{idleEnergyConsumption} E
                        </span>
                      )}
                      {output.conversion && (
                        <span className="bstat">
                          {getResourceSymbol(output.conversion.from)} → {getResourceSymbol(output.conversion.to)} ({output.conversion.rate}/h)
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
                    : costs
                        .map(({ resId, amount }) => `${getResourceSymbol(resId)} ${amount.toLocaleString()}`)
                        .join('  ·  ')}
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
            disabled={isProcessing}
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

          <button
            type="button"
            onClick={() => onDemolish(building.id)}
            disabled={isProcessing}
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
