import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useColonies } from '../hooks/useColonies';
import { useShipTypes } from '../hooks/useShips';
import { useMe } from '../hooks/useMe';
import { Planet } from '@shared/types/world';
import { apiFetch } from '../lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Truck, AlertTriangle, Navigation, Clock } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import type { CargoTransferPreviewResponse, CargoTransferRequest } from '@shared/types/cargo';
import type { Locale } from '@shared/types/locale';
import type { PlanetResource } from '@shared/types/world';
import { formatCargoTransferError, isCargoTransferShip } from '../lib/fleet';
import {
  JUMP_FUEL_RESOURCE_ID,
  JUMP_GATE_JUMP_FUEL_COST,
} from '@shared/config/expeditionRouting';
import { formatTimerDuration } from '../lib/timers';
import { getResourceLabel, ResourceIcon } from './cosmic/resources';
import { getShipClassTag, ShipIconBadge } from './cosmic/ships';
import { IntegerInput } from './IntegerInput';
import { planetResourcesQueryKey, usePlanetResources } from '../hooks/usePlanetResources';

interface CargoTransferDialogProps {
  originPlanet: Planet;
  initialShipId?: string | null;
  initialTargetPlanetId?: string | null;
  initialUseJumpGateRoute?: boolean;
  onClose: () => void;
}

interface DragOnlySliderProps {
  value: number;
  min?: number;
  max: number;
  label: string;
  testId?: string;
  onChange: (value: number) => void;
}

function clampNumber(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function DragOnlySlider({
  value,
  min = 0,
  max,
  label,
  testId,
  onChange,
}: DragOnlySliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const pointerOffsetRef = useRef(0);
  const activePointerIdRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const lastEmittedValueRef = useRef(value);
  const [isDragging, setIsDragging] = useState(false);
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const disabled = max <= min;
  const clampedValue = clampNumber(value, min, max);
  const valueRatio = disabled ? (max > 0 ? 1 : 0) : (clampedValue - min) / (max - min);
  const displayRatio = dragRatio ?? valueRatio;
  const pct = displayRatio * 100;

  useEffect(() => {
    lastEmittedValueRef.current = clampedValue;
    if (!isDraggingRef.current) {
      setDragRatio(null);
    }
  }, [clampedValue]);

  const ratioFromClientX = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return valueRatio;
      return clampNumber(
        (clientX - pointerOffsetRef.current - rect.left) / rect.width,
        0,
        1,
      );
    },
    [valueRatio],
  );

  const emitValueForRatio = useCallback(
    (ratio: number) => {
      const next = Math.round(min + ratio * (max - min));
      const clampedNext = clampNumber(next, min, max);
      if (clampedNext !== lastEmittedValueRef.current) {
        lastEmittedValueRef.current = clampedNext;
        onChange(clampedNext);
      }
    },
    [max, min, onChange],
  );

  const finishDrag = useCallback(
    (clientX?: number) => {
      if (clientX !== undefined) {
        const nextRatio = ratioFromClientX(clientX);
        emitValueForRatio(nextRatio);
      }
      activePointerIdRef.current = null;
      isDraggingRef.current = false;
      setIsDragging(false);
      setDragRatio(null);
    },
    [emitValueForRatio, ratioFromClientX],
  );

  useEffect(() => {
    if (!isDragging) return undefined;

    const handleWindowPointerMove = (event: PointerEvent) => {
      if (activePointerIdRef.current !== event.pointerId) return;
      event.preventDefault();
      const nextRatio = ratioFromClientX(event.clientX);
      setDragRatio(nextRatio);
      emitValueForRatio(nextRatio);
    };

    const handleWindowPointerUp = (event: PointerEvent) => {
      if (activePointerIdRef.current !== event.pointerId) return;
      event.preventDefault();
      finishDrag(event.clientX);
    };

    const handleWindowPointerCancel = (event: PointerEvent) => {
      if (activePointerIdRef.current !== event.pointerId) return;
      event.preventDefault();
      finishDrag();
    };

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', handleWindowPointerUp, { passive: false });
    window.addEventListener('pointercancel', handleWindowPointerCancel, { passive: false });
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerCancel);
    };
  }, [emitValueForRatio, finishDrag, isDragging, ratioFromClientX]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const step = event.shiftKey ? 10 : 1;
    let next = clampedValue;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next += step;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next -= step;
    if (event.key === 'Home') next = min;
    if (event.key === 'End') next = max;
    if (next !== clampedValue) {
      event.preventDefault();
      onChange(clampNumber(next, min, max));
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    event.preventDefault();
    pointerOffsetRef.current = event.clientX - (rect.left + valueRatio * rect.width);
    activePointerIdRef.current = event.pointerId;
    isDraggingRef.current = true;
    lastEmittedValueRef.current = clampedValue;
    setIsDragging(true);
    setDragRatio(valueRatio);
  };

  return (
    <div className="h-10 flex-1 touch-none select-none">
      <div ref={trackRef} className="relative mx-3 h-10">
        <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-slate-700" />
        <div
          className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-cyan-500"
          style={{ width: `${pct}%` }}
        />
        <button
          type="button"
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={clampedValue}
          data-testid={testId}
          disabled={disabled}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          role="slider"
          className="group absolute top-1/2 flex h-11 w-11 touch-none -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed"
          style={{ left: `${pct}%` }}
        >
          <span className="h-6 w-6 rounded-full border border-cyan-200 bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.35)] group-disabled:border-slate-600 group-disabled:bg-slate-600 group-disabled:shadow-none" />
        </button>
      </div>
    </div>
  );
}

function sortedResourceRows(resources: PlanetResource[] | undefined, locale: Locale) {
  return [...(resources ?? [])].sort((a, b) =>
    getResourceLabel(a.resourceId, locale).localeCompare(getResourceLabel(b.resourceId, locale)),
  );
}

function useCargoDialogScrollLock(scrollContainerRef: React.RefObject<HTMLDivElement>) {
  useLayoutEffect(() => {
    const { body, documentElement } = document;
    const scrollY = window.scrollY;
    const previousBodyStyle = {
      left: body.style.left,
      overflow: body.style.overflow,
      position: body.style.position,
      right: body.style.right,
      top: body.style.top,
      width: body.style.width,
    };
    const previousRootStyle = {
      overflow: documentElement.style.overflow,
      overscrollBehavior: documentElement.style.overscrollBehavior,
    };

    documentElement.style.overflow = 'hidden';
    documentElement.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';

    return () => {
      documentElement.style.overflow = previousRootStyle.overflow;
      documentElement.style.overscrollBehavior = previousRootStyle.overscrollBehavior;
      body.style.overflow = previousBodyStyle.overflow;
      body.style.position = previousBodyStyle.position;
      body.style.top = previousBodyStyle.top;
      body.style.left = previousBodyStyle.left;
      body.style.right = previousBodyStyle.right;
      body.style.width = previousBodyStyle.width;
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return undefined;

    let lastTouchY = 0;

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      lastTouchY = event.touches[0].clientY;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;

      const target = event.target;
      if (!(target instanceof Node) || !scrollContainer.contains(target)) {
        event.preventDefault();
        return;
      }

      const nextTouchY = event.touches[0].clientY;
      const deltaY = nextTouchY - lastTouchY;
      lastTouchY = nextTouchY;
      const canScroll = scrollContainer.scrollHeight > scrollContainer.clientHeight;
      const atTop = scrollContainer.scrollTop <= 0;
      const atBottom =
        scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 1;

      if (!canScroll || (atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
        event.preventDefault();
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
    };
  }, [scrollContainerRef]);
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
  const originResourcesQuery = usePlanetResources(originPlanet.id);
  
  const [selectedShipId, setSelectedShipId] = useState<string>(initialShipId ?? '');
  const [targetPlanetId, setTargetPlanetId] = useState<string>(initialTargetPlanetId ?? '');
  const [cargo, setCargo] = useState<Record<string, number>>({});
  const [fuelLoaded, setFuelLoaded] = useState(0);
  const [jumpFuelLoaded, setJumpFuelLoaded] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [useJumpGateRoute, setUseJumpGateRoute] = useState(Boolean(initialUseJumpGateRoute));
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useCargoDialogScrollLock(scrollContainerRef);

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
  const originResources = originResourcesQuery.data ?? [];
  const originResourceAmount = useCallback(
    (resourceId: string) =>
      Math.floor(
        Number(originResources.find((row) => row.resourceId === resourceId)?.amount ?? 0),
      ),
    [originResources],
  );
  const resourceRows = useMemo(
    () => sortedResourceRows(originResources, locale),
    [originResources, locale],
  );

  const totalCargo = Object.values(cargo).reduce((a, b) => a + b, 0);
  const capacity = selectedShipType?.cargo || 0;
  const resourceMaxForCargo = useCallback(
    (resourceId: string, available: number) => {
      const current = Number(cargo[resourceId] ?? 0);
      const usedByOtherResources = Math.max(0, totalCargo - current);
      const remainingCapacity = Math.max(0, capacity - usedByOtherResources);
      return Math.floor(Math.min(available, remainingCapacity));
    },
    [capacity, cargo, totalCargo],
  );
  const cargoLoads = useMemo(
    () => Object.entries(cargo)
      .filter(([_, amount]) => amount > 0)
      .map(([resourceId, amount]) => ({
        resourceId,
        amount,
      })),
    [cargo],
  );
  const jumpFuelAvailable = originResourceAmount(JUMP_FUEL_RESOURCE_ID);
  const jumpFuelReservedAsCargo = Math.floor(Number(cargo[JUMP_FUEL_RESOURCE_ID] ?? 0));
  const jumpFuelAvailableForRoute = Math.max(0, jumpFuelAvailable - jumpFuelReservedAsCargo);
  const fuelAvailable = originResourceAmount('fuel');
  const fuelReservedAsCargo = Math.floor(Number(cargo.fuel ?? 0));
  const fuelAvailableForRoute = Math.max(0, fuelAvailable - fuelReservedAsCargo);
  const isInterSystemTarget = Boolean(
    selectedTargetPlanet && selectedTargetPlanet.systemId !== originPlanet.systemId,
  );
  const jumpGateRouteSelected = isInterSystemTarget && useJumpGateRoute;
  const routeMode = jumpGateRouteSelected ? 'jump_gate' : 'standard';
  const previewQuery = useQuery({
    queryKey: ['cargo-transfer-preview', selectedShipId, targetPlanetId, routeMode],
    queryFn: () => apiFetch<CargoTransferPreviewResponse>('/cargo/transfer/preview', {
      method: 'POST',
      body: JSON.stringify({
        shipId: selectedShipId,
        targetPlanetId,
        routeMode,
        resources: [],
      }),
    }),
    enabled: Boolean(selectedShipId && targetPlanetId),
    retry: false,
  });
  const routePreview = previewQuery.data?.preview ?? null;
  const fuelRequired = routePreview?.fuelRequired ?? 0;
  const jumpFuelRequired = routePreview?.jumpFuelRequired ?? (jumpGateRouteSelected ? JUMP_GATE_JUMP_FUEL_COST : 0);
  const currentFuel = Math.floor(Number(selectedShip?.fuel ?? 0));
  const currentJumpFuel = Math.floor(Number(selectedShip?.jumpFuel ?? 0));
  const fuelCapacity = selectedShipType?.fuelCapacity ?? 0;
  const jumpFuelCapacity = selectedShipType?.jumpFuelCapacity ?? 0;
  const fuelLoadMax = Math.max(
    0,
    Math.floor(Math.min(fuelAvailableForRoute, Math.max(0, fuelCapacity - currentFuel))),
  );
  const fuelLoadMin = Math.min(
    fuelLoadMax,
    Math.max(0, Math.ceil(fuelRequired - currentFuel)),
  );
  const jumpFuelLoadMax = Math.max(
    0,
    Math.floor(
      Math.min(jumpFuelAvailableForRoute, Math.max(0, jumpFuelCapacity - currentJumpFuel)),
    ),
  );
  const jumpFuelLoadMin = Math.min(
    jumpFuelLoadMax,
    Math.max(0, Math.ceil(jumpFuelRequired - currentJumpFuel)),
  );
  const clampedFuelLoaded = clampNumber(fuelLoaded, fuelLoadMin, fuelLoadMax);
  const clampedJumpFuelLoaded = clampNumber(jumpFuelLoaded, jumpFuelLoadMin, jumpFuelLoadMax);
  const totalFuelAtLaunch = currentFuel + clampedFuelLoaded;
  const totalJumpFuelAtLaunch = currentJumpFuel + clampedJumpFuelLoaded;
  const shortOnFuel = fuelRequired > totalFuelAtLaunch;
  const shortOnJumpFuel = jumpFuelRequired > totalJumpFuelAtLaunch;
  const previewError = previewQuery.isError
    ? formatCargoTransferError(previewQuery.error.message, t)
    : null;

  useEffect(() => {
    setFuelLoaded((value) => clampNumber(value, fuelLoadMin, fuelLoadMax));
  }, [fuelLoadMax, fuelLoadMin]);

  useEffect(() => {
    setJumpFuelLoaded((value) => clampNumber(value, jumpFuelLoadMin, jumpFuelLoadMax));
  }, [jumpFuelLoadMax, jumpFuelLoadMin]);

  useEffect(() => {
    setCargo((previous) => {
      let changed = false;
      let used = 0;
      const next: Record<string, number> = {};

      for (const [resourceId, amount] of Object.entries(previous)) {
        const available = originResourceAmount(resourceId);
        const allowed = Math.max(0, Math.min(available, capacity - used));
        const clamped = Math.floor(clampNumber(amount, 0, allowed));
        if (clamped > 0) {
          next[resourceId] = clamped;
          used += clamped;
        }
        if (clamped !== amount) changed = true;
      }

      return changed ? next : previous;
    });
  }, [capacity, originResourceAmount]);

  const transferMutation = useMutation({
    mutationFn: (body: CargoTransferRequest) => apiFetch('/cargo/transfer', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      queryClient.invalidateQueries({ queryKey: planetResourcesQueryKey(originPlanet.id) });
      if (targetPlanetId) {
        queryClient.invalidateQueries({ queryKey: planetResourcesQueryKey(targetPlanetId) });
      }
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
      fuelLoaded: clampedFuelLoaded > 0 ? clampedFuelLoaded : undefined,
      jumpFuelLoaded: clampedJumpFuelLoaded > 0 ? clampedJumpFuelLoaded : undefined,
      resources: cargoLoads,
    });
  };

  const updateResourceAmount = (resourceId: string, amount: number) => {
    const maxAvailable = originResourceAmount(resourceId);
    setCargo(prev => {
      const current = Number(prev[resourceId] ?? 0);
      const usedByOtherResources = Object.entries(prev).reduce(
        (sum, [id, value]) => sum + (id === resourceId ? 0 : Number(value)),
        0,
      );
      const maxByCapacity = Math.max(0, capacity - usedByOtherResources);
      const finalAmount = Math.floor(clampNumber(amount, 0, Math.min(maxAvailable, maxByCapacity)));
      const next = { ...prev };
      if (finalAmount > 0) {
        next[resourceId] = finalAmount;
      } else {
        delete next[resourceId];
      }
      return finalAmount === current ? prev : next;
    });
  };

  return (
    <div
      className="cargo-transfer-backdrop fixed inset-0 z-[1200] flex h-[100dvh] items-stretch justify-center overflow-hidden bg-slate-950/80 p-3 backdrop-blur-sm sm:items-center sm:p-4"
      style={{
        paddingTop: 'max(12px, env(safe-area-inset-top, 12px))',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
      }}
    >
      <div
        data-testid="cargo-transfer-dialog"
        className="flex h-full w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl sm:h-auto sm:max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-800/50 p-4">
          <div className="flex items-center gap-2 text-cyan-400 font-bold uppercase tracking-wider text-sm">
            <Truck className="w-5 h-5" />
            {t('cargo.title')}
          </div>
          <button
            aria-label={t('common.close')}
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded-lg text-slate-400 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div
          ref={scrollContainerRef}
          data-testid="cargo-transfer-scroll"
          className="cargo-transfer-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
        >
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
              {resourceRows.map(res => {
                const available = Math.floor(Number(res.amount));
                const maxForResource = resourceMaxForCargo(res.resourceId, available);
                const current = Math.min(cargo[res.resourceId] || 0, maxForResource);
                const label = getResourceLabel(res.resourceId, locale);
                return (
                  <div
                    key={res.resourceId}
                    data-testid={`cargo-resource-${res.resourceId}`}
                    className="flex items-center gap-3 p-2 bg-slate-800/30 rounded-xl border border-slate-700/50"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700">
                      <span className="text-slate-400">
                        <ResourceIcon resourceId={res.resourceId} size={22} />
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between text-[10px] font-bold tracking-wider mb-1">
                        <span className="text-slate-400">{label}</span>
                        <span className="text-slate-500">{t('cargo.available', { amount: available })}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <DragOnlySlider
                          label={label}
                          max={maxForResource}
                          testId={`cargo-slider-${res.resourceId}`}
                          value={current}
                          onChange={(value) => updateResourceAmount(res.resourceId, value)}
                        />
                        <IntegerInput
                          min={0}
                          max={maxForResource}
                          value={current}
                          onValueChange={(value) => updateResourceAmount(res.resourceId, value)}
                          className="w-16 bg-slate-900 border border-slate-700 rounded-lg py-0.5 text-center text-xs text-cyan-400 font-mono"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Validation & Errors */}
          {(error || previewError) && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error || previewError}
            </div>
          )}

          {/* Route & fuel */}
          {routePreview ? (
            <section
              data-testid="cargo-route-fuel-panel"
              className="rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-xs text-slate-300"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-semibold text-slate-200">
                  <Clock className="h-4 w-4 text-cyan-300" />
                  {t('cargo.eta')}
                </span>
                <span className="font-mono text-cyan-300">{formatTimerDuration(routePreview.etaSeconds)}</span>
              </div>
              <div className="mt-3 flex justify-between gap-3">
                <span>{t('cargo.fuelCost')}</span>
                <span className={shortOnFuel ? 'text-amber-300' : 'text-cyan-300'}>
                  {fuelRequired} / {totalFuelAtLaunch}
                </span>
              </div>
              <div className="mt-1 flex justify-between gap-3 text-[10px] text-slate-500">
                <span>{t('expedition_dialog_tank_status', { current: currentFuel, capacity: fuelCapacity })}</span>
                <span>{t('expedition.availableOnPlanet')}: {fuelAvailableForRoute}</span>
              </div>
              <div className="mt-3">
                <div className="mb-1 flex justify-between gap-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <span>{t('expedition_dialog_load_fuel')}</span>
                  <span className="font-mono text-cyan-300">+{clampedFuelLoaded}</span>
                </div>
                <div className="flex items-center gap-2">
                  <DragOnlySlider
                    label={t('expedition_dialog_load_fuel')}
                    min={fuelLoadMin}
                    max={fuelLoadMax}
                    testId="cargo-fuel-slider"
                    value={clampedFuelLoaded}
                    onChange={setFuelLoaded}
                  />
                  <IntegerInput
                    min={fuelLoadMin}
                    max={fuelLoadMax}
                    value={clampedFuelLoaded}
                    onValueChange={setFuelLoaded}
                    className="h-9 w-16 rounded-lg border border-slate-700 bg-slate-950 py-0.5 text-center font-mono text-xs text-cyan-400"
                  />
                </div>
              </div>
              {jumpGateRouteSelected ? (
                <div className="mt-4 border-t border-slate-800 pt-3">
                  <div className="flex justify-between gap-3 font-semibold">
                    <span className="flex items-center gap-2">
                      <Navigation className="h-4 w-4 text-cyan-300" />
                      {t('cargo.jumpFuelCost')}
                    </span>
                    <span className={shortOnJumpFuel ? 'text-amber-300' : 'text-cyan-300'}>
                      {jumpFuelRequired} / {totalJumpFuelAtLaunch}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between gap-3 text-[10px] text-slate-500">
                    <span>{t('expedition_dialog_tank_status', { current: currentJumpFuel, capacity: jumpFuelCapacity })}</span>
                    <span>{t('expedition.availableOnPlanet')}: {jumpFuelAvailableForRoute}</span>
                  </div>
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between gap-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      <span>{t('expedition_dialog_load_jump_fuel')}</span>
                      <span className="font-mono text-cyan-300">+{clampedJumpFuelLoaded}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DragOnlySlider
                        label={t('expedition_dialog_load_jump_fuel')}
                        min={jumpFuelLoadMin}
                        max={jumpFuelLoadMax}
                        testId="cargo-jump-fuel-slider"
                        value={clampedJumpFuelLoaded}
                        onChange={setJumpFuelLoaded}
                      />
                      <IntegerInput
                        min={jumpFuelLoadMin}
                        max={jumpFuelLoadMax}
                        value={clampedJumpFuelLoaded}
                        onValueChange={setJumpFuelLoaded}
                        className="h-9 w-16 rounded-lg border border-slate-700 bg-slate-950 py-0.5 text-center font-mono text-xs text-cyan-400"
                      />
                    </div>
                  </div>
                  <div className="mt-2 text-[10px] text-slate-500">{t('cargo.jumpFuelHint')}</div>
                </div>
              ) : null}
              <div className="mt-2 text-[10px] text-slate-500">{t('cargo.fuelHint')}</div>
            </section>
          ) : previewQuery.isFetching ? (
            <div className="px-1 text-xs text-slate-500">{t('cargo.previewLoading')}</div>
          ) : null}
        </div>

        {/* Footer */}
        <div
          data-testid="cargo-transfer-footer"
          className="flex-shrink-0 border-t border-slate-800 bg-slate-900/95 p-3"
        >
          <div className="mb-3 flex items-center justify-between px-1">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('cargo.totalPayload')}</div>
            <div className={`text-sm font-bold ${totalCargo > capacity ? 'text-red-400' : 'text-cyan-400'}`}>
              {totalCargo} / {capacity}
            </div>
          </div>
          <button
            onClick={handleTransfer}
            disabled={transferMutation.isPending || previewQuery.isFetching || !selectedShipId || !targetPlanetId || totalCargo > capacity || !routePreview || shortOnFuel || shortOnJumpFuel}
            className="w-full rounded-xl bg-cyan-500 py-3 font-bold text-slate-950 shadow-[0_4px_20px_rgba(6,182,212,0.2)] transition-all hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500"
          >
            {transferMutation.isPending ? t('cargo.launching') : totalCargo > 0 ? t('cargo.initiate') : t('cargo.relocate')}
          </button>
        </div>
      </div>
    </div>
  );
}
