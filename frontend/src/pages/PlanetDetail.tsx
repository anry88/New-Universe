import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMe } from '../hooks/useMe';
import { apiFetch } from '../lib/api';
import { BuildingSlot } from '../components/BuildingSlot';
import { UpgradeDialog } from '../components/UpgradeDialog';
import { BuildDialog, type BuildDialogResourceChoice } from '../components/BuildDialog';
import { ProductionDialog } from '../components/ProductionDialog';
import { ResourceBar } from '../components/ResourceBar';
import { BuildQueue } from '../components/BuildQueue';
import {
  BIOME_META,
  CosmicBackground,
  CosmicBottomNav,
  getBiomeLabel,
  PlanetPortrait,
  PlanetRail,
  resolveBiome,
} from '../components/cosmic/atoms';
import type { Building, Planet } from '@shared/types/world';
import type { User } from '@shared/types/user';
import type {
  BuildingType,
  BuildBlockedReason,
  ChangeExtractorResourceResponse,
  ConstructionStatus,
  DemolishStatus,
} from '@shared/types/buildings';
import {
  formatBuildBlockedMessage,
  isSelectableExtractorType,
  resolveBuildBlockedReason,
  resolveBuildingProducedResourceIds,
  resolveExtractorSelectionBlockedReason,
  resolvePlanetResourceBlockedReason,
  selectableResourceIdsForExtractor,
} from '@shared/types/building-eligibility';
import { BUILDING_RESEARCH_GATES } from '@shared/config/buildingResearchGates';
import {
  COMMAND_CENTER_TYPE_ID,
  buildingUpgradeResourceCosts,
  buildingUpgradeTimeSeconds,
} from '@shared/config/buildingUpgradeEconomy';
import { recipesForBuildingType } from '@shared/config/productionRecipes';
import { buildingEnergyOutputForLevel } from '@shared/config/planetEnergy';
import {
  resolveInsufficientResourcesBlockedReason,
  resolveQueueFullBlockedReason,
} from '../lib/build-eligibility';
import { estimateLandingSlotUsage } from '../lib/ship-build-eligibility';
import { ChevronLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { formatHomeSystemTitleForUser } from '../lib/homeSystemTitle';
import { useI18n } from '../lib/i18n';
import { planetResourcesQueryKey, usePlanetResources } from '../hooks/usePlanetResources';
import { mergeLiveEnergyStatus } from '../lib/planet-energy';

function optimisticQueueWindow(durationSec: number): {
  queueStartedAt: string;
  queueCompletesAt: string;
} {
  const startedMs = Date.now();
  return {
    queueStartedAt: new Date(startedMs).toISOString(),
    queueCompletesAt: new Date(startedMs + Math.max(0, durationSec) * 1000).toISOString(),
  };
}

/**
 * PlanetDetail — Cosmic Atlas (P1.1 redesign).
 */
export function PlanetDetailPage() {
  const { planetId } = useParams();
  const navigate = useNavigate();
  const { search } = useLocation();
  const queryParams = useMemo(() => new URLSearchParams(search), [search]);
  const queryClient = useQueryClient();
  const { data: meData } = useMe();
  const { locale, t } = useI18n();

  const [buildingTypes, setBuildingTypes] = useState<BuildingType[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [productionBuilding, setProductionBuilding] = useState<Building | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    apiFetch<BuildingType[]>('/buildings/types').then(setBuildingTypes).catch(console.error);
  }, []);

  const allPlanets = useMemo<Planet[]>(
    () => meData?.planets ?? [],
    [meData]
  );

  const planet = useMemo<Planet | null>(() => {
    if (!planetId || !allPlanets.length) return null;
    return allPlanets.find((p) => p.id === planetId) ?? null;
  }, [allPlanets, planetId]);
  const planetResourcesQuery = usePlanetResources(planet?.id);
  const currentPlanetResources = planetResourcesQuery.data ?? planet?.resources;
  const railPlanets = useMemo(
    () =>
      allPlanets.filter(
        (candidate) =>
          candidate.isColonized === true || candidate.id === planet?.id,
      ),
    [allPlanets, planet?.id],
  );

  // Handle deep-link to a specific slot. We consume the `slot` query param exactly
  // once per URL change and strip it afterwards so refetches of `/me` (which give
  // `planet` a new reference) do not re-open the dialog after the player closes it.
  useEffect(() => {
    const slotParam = queryParams.get('slot');
    if (slotParam === null || !planet || buildingTypes.length === 0) return;
    if (planet.isColonized === false) return;
    const slotIndex = parseInt(slotParam, 10);
    if (!isNaN(slotIndex)) {
      const building = planet.buildings?.find((b) => b.slotIndex === slotIndex);
      if (building) {
        if (!building.queueAction) {
          setSelectedBuilding(building);
        }
      } else if (slotIndex < (planet.slotCount ?? 0)) {
        setSelectedSlot(slotIndex);
      }
    }
    navigate(`/planet/${planetId}`, { replace: true });
  }, [queryParams, planet, buildingTypes, navigate, planetId]);

  const biome = resolveBiome(planet?.biome);
  const accent = BIOME_META[biome].accent;

  const globalTypeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of meData?.planets ?? []) {
      for (const b of p.buildings ?? []) {
        m[b.typeId] = (m[b.typeId] ?? 0) + 1;
      }
    }
    return m;
  }, [meData?.planets]);

  const researchLevels = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of meData?.research ?? []) {
      m.set(r.branch, r.level);
    }
    return m;
  }, [meData?.research]);

  const planetDepositRows = useMemo(() => {
    const resourceRows = planet?.resources ?? [];
    const hasRichnessData = resourceRows.some((res) => typeof res.richness === 'number');
    return hasRichnessData
      ? resourceRows
          .filter((res) => (res.richness ?? 0) > 0)
          .map((res) => ({ resourceId: res.resourceId, value: res.richness ?? 0 }))
      : resourceRows.map((res) => ({ resourceId: res.resourceId, value: 1 }));
  }, [planet]);

  const planetDepositResourceIds = useMemo(
    () => planetDepositRows.map((row) => row.resourceId),
    [planetDepositRows],
  );

  const depositLimitsByResourceId = useMemo(
    () => Object.fromEntries(planetDepositRows.map((row) => [row.resourceId, row.value])),
    [planetDepositRows],
  );

  const usedExtractorCountsByResourceId = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const building of planet?.buildings ?? []) {
      if (building.queueAction === 'destroy') continue;
      if (!isSelectableExtractorType(building.typeId)) continue;

      const producedResourceIds = resolveBuildingProducedResourceIds({
        typeId: building.typeId,
        planetResourceIds: planetDepositResourceIds,
        selectedResourceId: building.selectedResourceId,
      });

      for (const resourceId of producedResourceIds) {
        counts[resourceId] = (counts[resourceId] ?? 0) + 1;
      }
    }
    return counts;
  }, [planet?.buildings, planetDepositResourceIds]);

  const commandCenterLevel = useMemo(() => {
    const commandCenter = planet?.buildings
      ?.filter((building) => building.typeId === COMMAND_CENTER_TYPE_ID && building.queueAction !== 'build')
      .sort((a, b) => b.level - a.level)[0];
    return commandCenter?.level ?? 0;
  }, [planet?.buildings]);

  const resourceChoicesForType = useCallback(
    (typeId: string): BuildDialogResourceChoice[] => {
      if (!isSelectableExtractorType(typeId)) return [];
      return selectableResourceIdsForExtractor({
        typeId,
        planetResourceIds: planetDepositResourceIds,
      }).map((resourceId) => ({
        resourceId,
        depositLimit: depositLimitsByResourceId[resourceId] ?? 0,
        used: usedExtractorCountsByResourceId[resourceId] ?? 0,
      }));
    },
    [depositLimitsByResourceId, planetDepositResourceIds, usedExtractorCountsByResourceId],
  );

  const usedExtractorCountsByResourceIdExcluding = useCallback(
    (excludedBuildingId: string) => {
      const counts: Record<string, number> = {};
      for (const building of planet?.buildings ?? []) {
        if (building.id === excludedBuildingId) continue;
        if (building.queueAction === 'destroy') continue;
        if (!isSelectableExtractorType(building.typeId)) continue;

        const producedResourceIds = resolveBuildingProducedResourceIds({
          typeId: building.typeId,
          planetResourceIds: planetDepositResourceIds,
          selectedResourceId: building.selectedResourceId,
        });

        for (const resourceId of producedResourceIds) {
          counts[resourceId] = (counts[resourceId] ?? 0) + 1;
        }
      }
      return counts;
    },
    [planet?.buildings, planetDepositResourceIds],
  );

  const resourceSwitchBlockedReasonForBuilding = useCallback(
    (building: Building, selectedResourceId: string): BuildBlockedReason | null => {
      if (!isSelectableExtractorType(building.typeId)) return null;
      return resolveExtractorSelectionBlockedReason({
        typeId: building.typeId,
        selectedResourceId,
        planetResourceIds: planetDepositResourceIds,
        depositLimitsByResourceId,
        usedExtractorCountsByResourceId: usedExtractorCountsByResourceIdExcluding(building.id),
      });
    },
    [
      depositLimitsByResourceId,
      planetDepositResourceIds,
      usedExtractorCountsByResourceIdExcluding,
    ],
  );

  const blockedReasonForType = useCallback(
    (typeId: string, selectedResourceId?: string | null): BuildBlockedReason | null => {
      const typeRow = buildingTypes.find((t) => t.id === typeId);
      if (!typeRow || !planet) return null;
      const planetBuilt =
        planet.buildings?.map((b) => ({ typeId: b.typeId, level: b.level })) ?? [];
      const dependencyBuildings =
        planet.buildings
          ?.filter((b) => b.queueAction !== 'build')
          .map((b) => ({ typeId: b.typeId, level: b.level })) ?? [];
      const blocked = resolveBuildBlockedReason({
        typeId: typeRow.id,
        deps: typeRow.deps ?? [],
        maxPerPlanet: typeRow.maxPerPlanet ?? null,
        maxGlobal: typeRow.maxGlobal ?? null,
        planetBuildings: planetBuilt,
        dependencyBuildings,
        globalCountForType: globalTypeCounts[typeRow.id] ?? 0,
        researchLevels,
        researchGate: BUILDING_RESEARCH_GATES[typeRow.id],
      });
      if (blocked) return blocked;

      const planetBlocked = isSelectableExtractorType(typeRow.id)
        ? resolveExtractorSelectionBlockedReason({
            typeId: typeRow.id,
            selectedResourceId,
            planetResourceIds: planetDepositResourceIds,
            depositLimitsByResourceId,
            usedExtractorCountsByResourceId,
          })
        : resolvePlanetResourceBlockedReason({
            typeId: typeRow.id,
            planetResourceIds: planetDepositResourceIds,
          });
      if (planetBlocked) return planetBlocked;

      const queueBlocked = resolveQueueFullBlockedReason({
        planetId: planet.id,
        planetBuildings: planet.buildings,
      });
      if (queueBlocked) return queueBlocked;

      const costBlocked = resolveInsufficientResourcesBlockedReason({
        costs: typeRow.baseCost ?? {},
        planetResources: currentPlanetResources,
      });
      if (costBlocked) return costBlocked;

      return null;
    },
    [
      buildingTypes,
      planet,
      globalTypeCounts,
      researchLevels,
      planetDepositResourceIds,
      depositLimitsByResourceId,
      usedExtractorCountsByResourceId,
    ],
  );

  const upgradeBlockedReasonForBuilding = useCallback(
    (building: Building, typeInfo: BuildingType): BuildBlockedReason | null => {
      if (building.level >= typeInfo.maxLevel) {
        return {
          code: 'building_blocked_max_level',
          details: { maxLevel: typeInfo.maxLevel },
        };
      }

      const requiredLevel = building.level + 1;
      if (building.typeId !== COMMAND_CENTER_TYPE_ID && requiredLevel > commandCenterLevel) {
        return {
          code: 'building_blocked_command_center_level',
          details: { commandCenterLevel, requiredLevel },
        };
      }

      const queueBlocked = resolveQueueFullBlockedReason({
        planetId: planet?.id,
        planetBuildings: planet?.buildings,
      });
      if (queueBlocked) return queueBlocked;

      const upgradeCosts = buildingUpgradeResourceCosts({
        typeId: typeInfo.id,
        baseCost: typeInfo.baseCost,
        currentLevel: building.level,
      });
      const costBlocked = resolveInsufficientResourcesBlockedReason({
        costs: upgradeCosts,
        planetResources: currentPlanetResources,
      });
      if (costBlocked) return costBlocked;

      return null;
    },
    [commandCenterLevel, planet?.buildings, planet?.id, currentPlanetResources],
  );

  const currentEnergy = useMemo(() => {
    if (!planet) return { produced: 0, consumed: 0 };
    const liveEnergy = mergeLiveEnergyStatus(planet.energy, currentPlanetResources);
    if (liveEnergy) {
      return {
        produced: liveEnergy.produced,
        consumed: liveEnergy.consumed,
        stored: liveEnergy.stored,
        capacity: liveEnergy.capacity,
        net: liveEnergy.net,
      };
    }
    if (planet.biome === 'energy') return { produced: 0, consumed: 0 };
    const byId = new Map(buildingTypes.map((t) => [t.id, t]));
    let produced = 0;
    let consumed = 0;
    for (const b of planet.buildings ?? []) {
      if (b.queueAction === 'build') continue;
      const type = byId.get(b.typeId);
      if (!type) continue;
      produced += buildingEnergyOutputForLevel({
        typeId: b.typeId,
        baseEnergy: type.baseOutput?.energy ?? 0,
        level: Math.max(1, b.level ?? 1),
        planet,
      });
      const consumesEnergyOnlyDuringProcess = recipesForBuildingType(type.id).length > 0;
      consumed += consumesEnergyOnlyDuringProcess ? 0 : (type.energyConsumption ?? 0) * Math.max(1, b.level ?? 1);
    }
    return { produced, consumed };
  }, [planet, buildingTypes, currentPlanetResources]);

  if (!planet) {
    return (
      <div
        className="cosmic-screen"
        style={{ '--accent': '#5BD7FF', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties}
      >
        <p style={{ color: 'var(--text-dim)' }}>{t('planet.notFound')}</p>
      </div>
    );
  }

  const usedSlots = planet.buildings?.length ?? 0;
  const slotCount = planet.slotCount ?? 0;
  const isColonized = planet.isColonized !== false;

  const handleSlotClick = (index: number, building?: Building) => {
    if (!isColonized) return;
    // Update URL with slot param for deep-linking
    navigate(`/planet/${planetId}?slot=${index}`, { replace: true });
    
    if (building) {
      if (building.queueAction) return;
      setSelectedBuilding(building);
    } else {
      setSelectedSlot(index);
    }
  };

  const handleBuild = async (typeId: string, selectedResourceId?: string | null) => {
    if (selectedSlot === null) return;
    const slotIndex = selectedSlot;
    setIsProcessing(true);

    await queryClient.cancelQueries({ queryKey: ['me'] });
    const previousMeData = queryClient.getQueryData<User>(['me']);
    const typeInfo = buildingTypes.find((t) => t.id === typeId);
    const tempId = `temp-building-${Date.now()}`;
    const optimisticTimer = optimisticQueueWindow(typeInfo?.baseTimeSec ?? 0);

    if (meData && typeInfo) {
      const optimisticMe = structuredClone(meData);
      const p = optimisticMe.planets?.find((pl) => pl.id === planet.id);
      if (p) {
        p.buildings = p.buildings || [];
        p.buildings.push({
          id: tempId,
          planetId: planet.id,
          typeId,
          selectedResourceId: selectedResourceId ?? null,
          level: 1,
          slotIndex,
          queueAction: 'build',
          queueCompletesAt: optimisticTimer.queueCompletesAt,
          queueStartedAt: optimisticTimer.queueStartedAt,
        });
      }
      queryClient.setQueryData(['me'], optimisticMe);
    }
    setSelectedSlot(null);

    try {
      const result = await apiFetch<ConstructionStatus>('/buildings/build', {
        method: 'POST',
        body: JSON.stringify({
          planetId: planet.id,
          typeId,
          slotIndex,
          selectedResourceId: selectedResourceId ?? null,
        }),
      });
      if (result.queueItem) {
        queryClient.setQueryData<User>(['me'], (current) => {
          if (!current) return current;
          const next = structuredClone(current);
          const p = next.planets?.find((pl) => pl.id === planet.id);
          const building = p?.buildings?.find((b) => b.id === tempId);
          if (building) {
            building.id = result.queueItem!.id;
            building.typeId = result.queueItem!.buildingTypeId;
            building.level = result.queueItem!.level;
            building.queueAction = result.queueItem!.queueAction;
            building.queueCompletesAt = result.queueItem!.queueCompletesAt;
            building.queueStartedAt = result.queueItem!.queueStartedAt;
            building.selectedResourceId = result.queueItem!.selectedResourceId ?? null;
            if (typeof result.queueItem!.slotIndex === 'number') {
              building.slotIndex = result.queueItem!.slotIndex;
            }
          }
          return next;
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('build.failedStart');
      alert(message);
      queryClient.setQueryData(['me'], previousMeData);
    } finally {
      setIsProcessing(false);
      queryClient.invalidateQueries({ queryKey: planetResourcesQueryKey(planet.id) });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  };

  const handleUpgrade = async (buildingId: string) => {
    setIsProcessing(true);

    await queryClient.cancelQueries({ queryKey: ['me'] });
    const previousMeData = queryClient.getQueryData<User>(['me']);

    if (meData) {
      const optimisticMe = structuredClone(meData);
      const p = optimisticMe.planets?.find((pl) => pl.id === planet.id);
      if (p) {
        const b = p.buildings?.find((bld) => bld.id === buildingId);
        if (b) {
          const typeInfo = buildingTypes.find((t) => t.id === b.typeId);
          const optimisticTimer = optimisticQueueWindow(
            typeInfo ? buildingUpgradeTimeSeconds(typeInfo.baseTimeSec, b.level) : 0,
          );
          b.queueAction = 'upgrade';
          b.queueCompletesAt = optimisticTimer.queueCompletesAt;
          b.queueStartedAt = optimisticTimer.queueStartedAt;
        }
      }
      queryClient.setQueryData(['me'], optimisticMe);
    }
    setSelectedBuilding(null);

    try {
      const result = await apiFetch<ConstructionStatus>('/buildings/upgrade', {
        method: 'POST',
        body: JSON.stringify({ buildingId }),
      });
      if (result.queueItem) {
        queryClient.setQueryData<User>(['me'], (current) => {
          if (!current) return current;
          const next = structuredClone(current);
          const p = next.planets?.find((pl) => pl.id === result.queueItem!.planetId);
          const building = p?.buildings?.find((b) => b.id === result.queueItem!.id);
          if (building) {
            building.queueAction = result.queueItem!.queueAction;
            building.queueCompletesAt = result.queueItem!.queueCompletesAt;
            building.queueStartedAt = result.queueItem!.queueStartedAt;
          }
          return next;
        });
      }
    } catch (err: unknown) {
      const errorData = err instanceof Error ? (err as Error & { data?: unknown }).data : null;
      const blockedReason =
        errorData !== null &&
        typeof errorData === 'object' &&
        'code' in errorData &&
        'details' in errorData
          ? ({
              code: (errorData as { code: BuildBlockedReason['code'] }).code,
              details: (errorData as { details: BuildBlockedReason['details'] }).details,
            } as BuildBlockedReason)
          : null;
      const message = blockedReason
        ? formatBuildBlockedMessage(blockedReason, locale)
        : err instanceof Error ? err.message : t('build.failedUpgrade');
      alert(message);
      queryClient.setQueryData(['me'], previousMeData);
    } finally {
      setIsProcessing(false);
      queryClient.invalidateQueries({ queryKey: planetResourcesQueryKey(planet.id) });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  };

  const handleChangeExtractorResource = async (buildingId: string, selectedResourceId: string) => {
    setIsProcessing(true);
    const previousMeData = queryClient.getQueryData(['me']);

    if (meData) {
      const optimisticMe = structuredClone(meData);
      const p = optimisticMe.planets?.find((pl) => pl.id === planet.id);
      const b = p?.buildings?.find((bld) => bld.id === buildingId);
      if (b) {
        b.selectedResourceId = selectedResourceId;
      }
      queryClient.setQueryData(['me'], optimisticMe);
    }

    try {
      await apiFetch<ChangeExtractorResourceResponse>('/buildings/resource', {
        method: 'POST',
        body: JSON.stringify({ buildingId, selectedResourceId }),
      });
      setSelectedBuilding((current) =>
        current?.id === buildingId ? { ...current, selectedResourceId } : current,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('build.failedResourceSwitch');
      alert(message);
      queryClient.setQueryData(['me'], previousMeData);
    } finally {
      setIsProcessing(false);
      queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  };

  const handleDemolish = async (buildingId: string) => {
    if (!window.confirm(t('build.confirmDemolish'))) {
      return;
    }

    setIsProcessing(true);
    const previousMeData = queryClient.getQueryData(['me']);

    try {
      await apiFetch<DemolishStatus>('/buildings/demolish', {
        method: 'POST',
        body: JSON.stringify({ buildingId }),
      });
      setSelectedBuilding(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('build.failedDemolish');
      alert(message);
      queryClient.setQueryData(['me'], previousMeData);
    } finally {
      setIsProcessing(false);
      queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  };

  const selectedBuildingType = selectedBuilding
    ? buildingTypes.find((t) => t.id === selectedBuilding.typeId)
    : undefined;
  const selectedUpgradeBlockedReason = selectedBuilding && selectedBuildingType
    ? upgradeBlockedReasonForBuilding(selectedBuilding, selectedBuildingType)
    : null;
  const selectedDemolishBlockedReason = useMemo(() => {
    if (!selectedBuilding || !planet) return null;
    if (selectedBuilding.queueAction) {
      return {
        code: 'demolish_blocked_queued',
        message:
          locale === 'ru'
            ? 'Сначала дождитесь окончания текущей работы здания.'
            : 'Wait for this building to finish its current queue first.',
      } as const;
    }
    if (selectedBuilding.typeId === 'spaceport') {
      const usage = estimateLandingSlotUsage({
        planet,
        ships: meData?.ships,
        expeditions: meData?.expeditions,
      });
      if (usage.used > 0) {
        return {
          code: 'demolish_blocked_spaceport_reserved',
          message:
            locale === 'ru'
              ? `Космопорт обслуживает ${usage.occupied} пришвартованных и ${usage.reserved} зарезервированных слотов — снос невозможен.`
              : `Spaceport has ${usage.occupied} docked ship(s) and ${usage.reserved} reservation(s) — demolish blocked.`,
        } as const;
      }
    }
    return null;
  }, [selectedBuilding, planet, meData?.ships, meData?.expeditions, locale]);
  const selectedBuildingCanProduce =
    selectedBuildingType ? recipesForBuildingType(selectedBuildingType.id).length > 0 : false;

  const systemName = meData ? formatHomeSystemTitleForUser(meData) : t('planet.homeSystem');
  const sectorTag = meData?.homeSystem
    ? `${meData.homeSystem.sectorX ?? 0}:${meData.homeSystem.sectorY ?? 0}:${meData.homeSystem.sectorZ ?? 0}`
    : '';

  return (
    <div className="cosmic-screen" style={{ '--accent': accent } as React.CSSProperties}>
      <CosmicBackground accent={accent} starSeed={planet.id.charCodeAt(0) || 7} />

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <ResourceBar planetId={planet.id} planetLabel={planet.name} />

        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            padding: '8px 12px 0',
          }}
        >
          <button
            type="button"
            aria-label={t('common.back')}
            onClick={() => navigate(-1)}
            style={{
              padding: 6,
              borderRadius: 999,
              color: 'var(--text-dim)',
            }}
          >
            <ChevronLeft size={20} />
          </button>
        </div>

        <div className="cosmic-scroll">
          <PlanetPortrait
            biome={biome}
            name={planet.name}
            size={planet.size}
            slots={slotCount}
            slotsUsed={usedSlots}
          />

          <div className="rail-wrap">
            <div className="rail-label">
              {systemName.toUpperCase()}
              {sectorTag ? ` · ${sectorTag}` : ''}
            </div>
            <PlanetRail
              planets={railPlanets.map((p) => ({ id: p.id, name: p.name, biome: p.biome }))}
              current={planet.id}
              onSelect={(id) => navigate(`/planet/${id}`)}
            />
          </div>

          <div className="slots-section">
            <div className="section-head">
              <div className="section-title">{t('build.installations').toUpperCase()}</div>
              <div className="section-count">
                {usedSlots}/{slotCount} {t('common.slots')}
              </div>
            </div>
            {isColonized ? (
              <div className="slots-grid">
                {Array.from({ length: slotCount }, (_, i) => {
                  const building = planet.buildings?.find((b) => b.slotIndex === i);
                  return (
                    <BuildingSlot
                      key={i}
                      index={i}
                      building={building}
                      onClick={handleSlotClick}
                      biomeAccent={accent}
                    />
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  padding: '18px 14px',
                  border: '1px dashed var(--line-strong)',
                  borderRadius: 8,
                  color: 'var(--text-dim)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {t('build.colonizerRequired')}
              </div>
            )}
          </div>
        </div>

        <div className="fixed-bottom-ui">
          <BuildQueue planetId={planet.id} />
          <CosmicBottomNav />
        </div>
      </div>

      <BuildDialog
        isOpen={selectedSlot !== null}
        onClose={() => setSelectedSlot(null)}
        types={buildingTypes}
        onAction={handleBuild}
        isProcessing={isProcessing}
        blockedReasonFor={blockedReasonForType}
        resourceChoicesFor={resourceChoicesForType}
        accent={accent}
        planetLabel={`${planet.name} · ${getBiomeLabel(biome, locale)}`}
        currentEnergy={currentEnergy}
        energyFree={planet.biome === 'energy'}
        planet={planet}
      />

      <UpgradeDialog
        isOpen={selectedBuilding !== null}
        onClose={() => setSelectedBuilding(null)}
        building={selectedBuilding || undefined}
        typeInfo={selectedBuildingType}
        onAction={handleUpgrade}
        onDemolish={handleDemolish}
        onOpenShipyard={() => navigate('/ships?tab=shipyard')}
        onOpenProduction={
          selectedBuildingCanProduce && selectedBuilding
            ? () => {
                setProductionBuilding(selectedBuilding);
                setSelectedBuilding(null);
              }
            : undefined
        }
        resourceChoices={selectedBuilding ? resourceChoicesForType(selectedBuilding.typeId) : []}
        resourceSwitchBlockedReason={
          selectedBuilding
            ? (resourceId) => resourceSwitchBlockedReasonForBuilding(selectedBuilding, resourceId)
            : undefined
        }
        upgradeBlockedReason={selectedUpgradeBlockedReason}
        demolishBlockedMessage={selectedDemolishBlockedReason?.message ?? null}
        onChangeResource={handleChangeExtractorResource}
        isProcessing={isProcessing}
        accent={accent}
        energyFree={planet.biome === 'energy'}
        currentEnergy={currentEnergy}
        planet={planet}
      />

      <ProductionDialog
        isOpen={productionBuilding !== null}
        onClose={() => setProductionBuilding(null)}
        building={productionBuilding}
        planetId={planet.id}
        accent={accent}
        onStarted={() => {
          queryClient.invalidateQueries({ queryKey: ['me'] });
          queryClient.invalidateQueries({ queryKey: planetResourcesQueryKey(planet.id) });
        }}
      />
    </div>
  );
}
