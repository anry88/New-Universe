import React, { useState, useMemo } from 'react';
import { useColonies } from '../hooks/useColonies';
import { useShipTypes } from '../hooks/useShips';
import { useMe } from '../hooks/useMe';
import { Planet } from '@shared/types/world';
import { apiFetch } from '../lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Truck, AlertTriangle, Navigation, Clock } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import type { CargoTransferPreviewResponse, CargoTransferRequest } from '@shared/types/cargo';
import { formatCargoTransferError, isCargoTransferShip } from '../lib/fleet';
import {
  JUMP_FUEL_RESOURCE_ID,
  JUMP_GATE_JUMP_FUEL_COST,
} from '@shared/config/expeditionRouting';
import { formatTimerDuration } from '../lib/timers';
import { getResourceLabel, ResourceIcon } from './cosmic/resources';
import { getShipClassTag, ShipIconBadge } from './cosmic/ships';

interface CargoTransferDialogProps {
  originPlanet: Planet;
  initialShipId?: string | null;
  initialTargetPlanetId?: string | null;
  initialUseJumpGateRoute?: boolean;
  onClose: () => void;
}

export function CargoTransferDialog({
  originPlanet,
  initialShipId,
  initialTargetPlanetId,
  initialUseJumpGateRoute,
  onClose,
}: CargoTransferDialogProps) {
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();
  const { data: meData } = useMe();
  const { planets } = useColonies();
  const { data: shipTypes } = useShipTypes();
  
  const [selectedShipId, setSelectedShipId] = useState<string>(initialShipId ?? '');
  const [targetPlanetId, setTargetPlanetId] = useState<string>(initialTargetPlanetId ?? '');
  const [cargo, setCargo] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [useJumpGateRoute, setUseJumpGateRoute] = useState(Boolean(initialUseJumpGateRoute));

  const availableShips = useMemo(() =>
    meData?.ships?.filter((ship) =>
      ship.locationPlanetId === originPlanet.id &&
      ship.status === 'idle' &&
      isCargoTransferShip(ship, shipTypes),
    ) || []
  , [meData?.ships, originPlanet.id, shipTypes]);

  const targetPlanets = useMemo(() => 
    planets.filter(p => p.id !== originPlanet.id)
  , [planets, originPlanet.id]);
  
  const selectedShip = availableShips.find(s => s.id === selectedShipId);
  const selectedShipType = selectedShip && shipTypes?.find(t => t.id === selectedShip.typeId);
  const selectedTargetPlanet = targetPlanets.find(p => p.id === targetPlanetId);

  const totalCargo = Object.values(cargo).reduce((a, b) => a + b, 0);
  const capacity = selectedShipType?.cargo || 0;
  const cargoLoads = useMemo(
    () => Object.entries(cargo)
      .filter(([_, amount]) => amount > 0)
      .map(([resourceId, amount]) => ({
        resourceId,
        amount,
      })),
    [cargo],
  );
  const jumpFuelAvailable = Math.floor(
    Number(originPlanet.resources?.find(r => r.resourceId === JUMP_FUEL_RESOURCE_ID)?.amount ?? 0),
  );
  const jumpFuelReservedAsCargo = Math.floor(Number(cargo[JUMP_FUEL_RESOURCE_ID] ?? 0));
  const jumpFuelAvailableForRoute = Math.max(0, jumpFuelAvailable - jumpFuelReservedAsCargo);
  const fuelAvailable = Math.floor(
    Number(originPlanet.resources?.find(r => r.resourceId === 'fuel')?.amount ?? 0),
  );
  const fuelReservedAsCargo = Math.floor(Number(cargo.fuel ?? 0));
  const fuelAvailableForRoute = Math.max(0, fuelAvailable - fuelReservedAsCargo);
  const isInterSystemTarget = Boolean(
    selectedTargetPlanet && selectedTargetPlanet.systemId !== originPlanet.systemId,
  );
  const jumpGateRouteSelected = isInterSystemTarget && useJumpGateRoute;
  const routeMode = jumpGateRouteSelected ? 'jump_gate' : 'standard';
  const previewQuery = useQuery({
    queryKey: ['cargo-transfer-preview', selectedShipId, targetPlanetId, routeMode, cargoLoads],
    queryFn: () => apiFetch<CargoTransferPreviewResponse>('/cargo/transfer/preview', {
      method: 'POST',
      body: JSON.stringify({
        shipId: selectedShipId,
        targetPlanetId,
        routeMode,
        resources: cargoLoads,
      }),
    }),
    enabled: Boolean(selectedShipId && targetPlanetId),
    retry: false,
  });
  const routePreview = previewQuery.data?.preview ?? null;
  const fuelRequired = routePreview?.fuelRequired ?? 0;
  const jumpFuelRequired = routePreview?.jumpFuelRequired ?? (jumpGateRouteSelected ? JUMP_GATE_JUMP_FUEL_COST : 0);
  const shortOnFuel = fuelRequired > fuelAvailableForRoute;
  const shortOnJumpFuel = jumpFuelRequired > jumpFuelAvailableForRoute;
  const previewError = previewQuery.isError
    ? formatCargoTransferError(previewQuery.error.message, t)
    : null;

  const transferMutation = useMutation({
    mutationFn: (body: CargoTransferRequest) => apiFetch('/cargo/transfer', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      onClose();
    },
    onError: (err: Error) => {
      setError(formatCargoTransferError(err.message, t));
    }
  });

  const handleTransfer = () => {
    setError(null);
    if (!selectedShipId) return setError(t('cargo.selectShipError'));
    if (!targetPlanetId) return setError(t('cargo.selectTargetError'));
    if (totalCargo > capacity) return setError(t('cargo.capacityError'));
    if (previewError) return setError(previewError);
    if (!routePreview) return setError(t('cargo.previewRequired'));
    if (shortOnFuel) return setError(t('cargo.fuelError'));
    if (shortOnJumpFuel) return setError(t('cargo.jumpFuelError'));

    transferMutation.mutate({
      shipId: selectedShipId,
      targetPlanetId,
      routeMode,
      resources: cargoLoads,
    });
  };

  const updateResourceAmount = (resourceId: string, amount: number) => {
    const planetRes = originPlanet.resources?.find(r => r.resourceId === resourceId);
    const maxAvailable = planetRes ? Math.floor(Number(planetRes.amount)) : 0;
    const finalAmount = Math.max(0, Math.min(amount, maxAvailable));
    
    setCargo(prev => ({
      ...prev,
      [resourceId]: finalAmount
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div
        data-testid="cargo-transfer-dialog"
        className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/50">
          <div className="flex items-center gap-2 text-cyan-400 font-bold uppercase tracking-wider text-sm">
            <Truck className="w-5 h-5" />
            {t('cargo.title')}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded-lg text-slate-400 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-6 flex-1">
          {/* Ship Selection */}
          <section>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-tighter mb-2">{t('cargo.selectShip')}</label>
            <div className="grid gap-2">
              {availableShips.length > 0 ? (
                availableShips.map(ship => {
                  const type = shipTypes?.find(t => t.id === ship.typeId);
                  return (
                    <button
                      key={ship.id}
                      onClick={() => setSelectedShipId(ship.id)}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        selectedShipId === ship.id 
                          ? 'bg-cyan-500/10 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.1)]' 
                          : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-3 text-left">
                        <ShipIconBadge
                          typeId={ship.typeId}
                          status={ship.status}
                          size={30}
                          title={type?.name[locale] || t('cargo.unknownShip')}
                        />
                        <div>
                          <div className="text-sm font-bold text-slate-200">{type?.name[locale] || t('cargo.unknownShip')}</div>
                          <div className="text-[10px] text-slate-400">{getShipClassTag(ship.typeId, locale)}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-cyan-400 font-medium">{t('cargo.capacity', { capacity: type?.cargo || 0 })}</div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="text-center p-6 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
                  <p className="text-xs text-slate-500">{t('cargo.noIdleShips')}</p>
                </div>
              )}
            </div>
          </section>

          {/* Target Planet */}
          <section>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-tighter mb-2">{t('cargo.destination')}</label>
            <select
              value={targetPlanetId}
              onChange={(e) => {
                setTargetPlanetId(e.target.value);
                setUseJumpGateRoute(false);
              }}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-500 transition-colors"
            >
              <option value="">{t('cargo.selectColony')}</option>
              {targetPlanets.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {isInterSystemTarget ? (
              <label className="mt-3 flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-800/30 p-3 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={useJumpGateRoute}
                  onChange={(e) => setUseJumpGateRoute(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-cyan-500"
                />
                <span className="flex-1">
                  <span className="flex items-center gap-2 font-semibold text-slate-200">
                    <Navigation className="h-4 w-4 text-cyan-300" />
                    {t('cargo.jumpGateRoute')}
                  </span>
                  <span className="mt-1 block text-[10px] text-slate-500">{t('cargo.jumpGateRouteHint')}</span>
                </span>
              </label>
            ) : null}
          </section>

          {/* Resource Selection */}
          <section>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-tighter mb-2">{t('cargo.load')}</label>
            <div className="space-y-2">
              {originPlanet.resources?.map(res => (
                <div key={res.resourceId} className="flex items-center gap-3 p-2 bg-slate-800/30 rounded-xl border border-slate-700/50">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700">
                     <span className="text-slate-400">
                       <ResourceIcon resourceId={res.resourceId} size={22} />
                     </span>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between text-[10px] font-bold tracking-wider mb-1">
                      <span className="text-slate-400">{getResourceLabel(res.resourceId, locale)}</span>
                      <span className="text-slate-500">{t('cargo.available', { amount: Math.floor(Number(res.amount)) })}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max={Math.floor(Number(res.amount))}
                        value={cargo[res.resourceId] || 0}
                        onChange={(e) => updateResourceAmount(res.resourceId, parseInt(e.target.value))}
                        className="flex-1 accent-cyan-500 h-1"
                      />
                      <input
                        type="number"
                        min="0"
                        max={Math.floor(Number(res.amount))}
                        value={cargo[res.resourceId] || 0}
                        onChange={(e) => updateResourceAmount(res.resourceId, parseInt(e.target.value) || 0)}
                        className="w-16 bg-slate-900 border border-slate-700 rounded-lg py-0.5 text-center text-xs text-cyan-400 font-mono"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Validation & Errors */}
          {(error || previewError) && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error || previewError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-800/30 border-t border-slate-800">
          <div className="flex justify-between items-center mb-4 px-1">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('cargo.totalPayload')}</div>
            <div className={`text-sm font-bold ${totalCargo > capacity ? 'text-red-400' : 'text-cyan-400'}`}>
              {totalCargo} / {capacity}
            </div>
          </div>
          {routePreview ? (
            <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-xs text-slate-300">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-semibold text-slate-200">
                  <Clock className="h-4 w-4 text-cyan-300" />
                  {t('cargo.eta')}
                </span>
                <span className="font-mono text-cyan-300">{formatTimerDuration(routePreview.etaSeconds)}</span>
              </div>
              <div className="mt-2 flex justify-between gap-3">
                <span>{t('cargo.fuelCost')}</span>
                <span className={shortOnFuel ? 'text-amber-300' : 'text-cyan-300'}>
                  {fuelRequired} / {fuelAvailableForRoute}
                </span>
              </div>
            </div>
          ) : previewQuery.isFetching ? (
            <div className="mb-4 px-1 text-xs text-slate-500">{t('cargo.previewLoading')}</div>
          ) : null}
          {jumpGateRouteSelected ? (
            <div className="flex items-start gap-2 mb-4 px-1 text-xs text-slate-300">
              <Navigation className="w-4 h-4 text-cyan-300 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="flex justify-between gap-3 font-semibold">
                  <span>{t('cargo.jumpFuelCost')}</span>
                  <span className={shortOnJumpFuel ? 'text-amber-300' : 'text-cyan-300'}>
                    {jumpFuelRequired} / {jumpFuelAvailableForRoute}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">{t('cargo.jumpFuelHint')}</div>
              </div>
            </div>
          ) : null}
          
          <button
            onClick={handleTransfer}
            disabled={transferMutation.isPending || previewQuery.isFetching || !selectedShipId || !targetPlanetId || totalCargo > capacity || !routePreview || shortOnFuel || shortOnJumpFuel}
            className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-bold py-3 rounded-xl transition-all shadow-[0_4px_20px_rgba(6,182,212,0.2)]"
          >
            {transferMutation.isPending ? t('cargo.launching') : totalCargo > 0 ? t('cargo.initiate') : t('cargo.relocate')}
          </button>
        </div>
      </div>
    </div>
  );
}
