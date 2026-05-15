import React, { useState } from 'react';
import { X, Droplets } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useRefuel } from '../hooks/useShips';
import { getShipLabel, ShipIconBadge } from './cosmic/ships';
import type { Ship, ShipType } from '@shared/types/ships';
import { getResourceSymbol } from './cosmic/resources';

interface RefuelDialogProps {
  sourceShip: Ship;
  sourceType: ShipType;
  allShips: Ship[];
  allShipTypes: ShipType[];
  initialTargetShipId?: string;
  onClose: () => void;
}

export function RefuelDialog({
  sourceShip,
  sourceType,
  allShips,
  allShipTypes,
  initialTargetShipId,
  onClose,
}: RefuelDialogProps) {
  const { t, locale } = useI18n();
  const refuel = useRefuel();

  const [targetShipId, setTargetShipId] = useState<string>(initialTargetShipId ?? '');
  const [fuelAmount, setFuelAmount] = useState<number>(0);
  const [jumpFuelAmount, setJumpFuelAmount] = useState<number>(0);

  const idleShipsOnSamePlanet = allShips.filter(
    (s) =>
      s.id !== sourceShip.id &&
      s.status === 'idle' &&
      s.locationPlanetId === sourceShip.locationPlanetId &&
      sourceShip.locationPlanetId !== null
  );

  const targetShip = idleShipsOnSamePlanet.find((s) => s.id === targetShipId);
  const targetType = targetShip ? allShipTypes.find((st) => st.id === targetShip.typeId) : null;

  const maxFuel = Math.max(
    0,
    Math.min(
      Number(sourceShip.fuel),
      targetType ? targetType.fuelCapacity - Number(targetShip?.fuel ?? 0) : 0,
    ),
  );
  const maxJumpFuel = Math.max(
    0,
    Math.min(
      Number(sourceShip.jumpFuel),
      targetType ? targetType.jumpFuelCapacity - Number(targetShip?.jumpFuel ?? 0) : 0,
    ),
  );

  const [error, setError] = useState<string | null>(null);

  const handleRefuel = async () => {
    if (!targetShipId) return;
    try {
      setError(null);
      await refuel.mutateAsync({
        targetShipId,
        sourceShipId: sourceShip.id,
        fuel: fuelAmount,
        jumpFuel: jumpFuelAmount,
      });
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || t('refuel.error.generic'));
    }
  };

  return (
    <div className="cosmic-modal-overlay" onClick={onClose}>
      <div className="cosmic-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            <Droplets size={18} style={{ color: '#5BD7FF' }} />
            {t('refuel_dialog_title')}
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body scrollable">
          {error && (
            <div style={{
              color: '#f87171',
              fontSize: 12,
              marginBottom: 16,
              padding: '10px 12px',
              background: 'rgba(248, 113, 113, 0.08)',
              border: '1px solid rgba(248, 113, 113, 0.2)',
              borderRadius: 8,
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.4
            }}>
              {error}
            </div>
          )}
          <div className="refuel-source-info">
            <div className="refuel-label">{t('refuel_dialog_source')}</div>
            <div className="ship-row mini">
              <ShipIconBadge typeId={sourceShip.typeId} status={sourceShip.status} size={28} />
              <div className="ship-info">
                <div className="ship-name">{sourceType.name[locale]}</div>
                <div className="ship-stats-row">
                  <span className="ship-stat-mini">
                    {getResourceSymbol('fuel')} {Number(sourceShip.fuel).toFixed(0)} / {sourceType.fuelCapacity}
                  </span>
                  <span className="ship-stat-mini">
                    {getResourceSymbol('jump_fuel')} {Number(sourceShip.jumpFuel).toFixed(0)} / {sourceType.jumpFuelCapacity}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="refuel-target-select">
            <div className="refuel-label">{t('refuel_dialog_target')}</div>
            {idleShipsOnSamePlanet.length === 0 ? (
              <div className="empty-hint">{t('refuel.no_targets')}</div>
            ) : (
              <div className="target-list">
                {idleShipsOnSamePlanet.map((s) => {
                  const st = allShipTypes.find((type) => type.id === s.typeId);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`target-btn ${targetShipId === s.id ? 'active' : ''}`}
                      onClick={() => {
                        setTargetShipId(s.id);
                        setFuelAmount(0);
                        setJumpFuelAmount(0);
                      }}
                    >
                      <ShipIconBadge typeId={s.typeId} status={s.status} size={24} />
                      <div className="target-name">
                        {st?.name[locale] ?? getShipLabel(s.typeId, locale)}
                      </div>
                      <div className="target-fuel">
                        {Number(s.fuel).toFixed(0)} / {st?.fuelCapacity}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {targetShip && targetType && (
            <div className="refuel-controls">
              <div className="refuel-control">
                <div className="control-header">
                  <div className="refuel-label">{t('refuel_dialog_fuel_label')}</div>
                  <div className="control-value">{fuelAmount}</div>
                </div>
                <input
                  type="range"
                  className="cosmic-range"
                  min={0}
                  max={maxFuel}
                  step={1}
                  value={fuelAmount}
                  onChange={(e) => setFuelAmount(Number(e.target.value))}
                />
                <div className="range-limits">
                  <span>0</span>
                  <span>{maxFuel}</span>
                </div>
              </div>

              <div className="refuel-control">
                <div className="control-header">
                  <div className="refuel-label">{t('refuel_dialog_jump_fuel_label')}</div>
                  <div className="control-value">{jumpFuelAmount}</div>
                </div>
                <input
                  type="range"
                  className="cosmic-range"
                  min={0}
                  max={maxJumpFuel}
                  step={1}
                  value={jumpFuelAmount}
                  onChange={(e) => setJumpFuelAmount(Number(e.target.value))}
                />
                <div className="range-limits">
                  <span>0</span>
                  <span>{maxJumpFuel}</span>
                </div>

              </div>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button
            type="button"
            className="cosmic-cta primary"
            disabled={!targetShipId || (fuelAmount === 0 && jumpFuelAmount === 0) || refuel.isPending}
            onClick={handleRefuel}
            style={{ width: '100%' }}
          >
            {refuel.isPending ? t('common.loading') : t('refuel_dialog_transfer_button').toUpperCase()}
          </button>
        </div>
      </div>

      <style>{`
        .refuel-source-info {
          background: rgba(91, 215, 255, 0.05);
          border: 1px solid rgba(91, 215, 255, 0.15);
          border-radius: 8px;
          padding: 10px;
          margin-bottom: 16px;
        }
        .refuel-label {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-dim);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 8px;
        }
        .ship-row.mini {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .ship-info {
          flex: 1;
        }
        .ship-name {
          font-weight: 600;
          font-size: 14px;
          color: var(--text-bright);
        }
        .ship-stats-row {
          display: flex;
          gap: 12px;
          margin-top: 2px;
        }
        .ship-stat-mini {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-dim);
        }
        .target-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 16px;
          max-height: 150px;
          overflow-y: auto;
          padding-right: 4px;
        }
        .target-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: var(--text-bright);
          transition: all 0.2s;
          text-align: left;
        }
        .target-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.2);
        }
        .target-btn.active {
          background: rgba(91, 215, 255, 0.15);
          border-color: #5BD7FF;
          box-shadow: 0 0 10px rgba(91, 215, 255, 0.2);
        }
        .target-name {
          flex: 1;
          font-size: 13px;
        }
        .target-fuel {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-dim);
        }
        .refuel-controls {
          display: flex;
          flex-direction: column;
          gap: 20px;
          padding: 10px 0;
        }
        .control-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }
        .control-value {
          font-family: var(--font-mono);
          font-size: 16px;
          color: #5BD7FF;
          font-weight: 600;
        }
        .range-limits {
          display: flex;
          justify-content: space-between;
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-faint);
          margin-top: 4px;
        }
        .empty-hint {
          padding: 20px;
          text-align: center;
          color: var(--text-faint);
          font-family: var(--font-mono);
          font-size: 12px;
          border: 1px dashed rgba(255, 255, 255, 0.1);
          border-radius: 8px;
        }
      `}</style>
    </div>
  );
}
