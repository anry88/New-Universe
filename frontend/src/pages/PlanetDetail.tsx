import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMe } from '../hooks/useMe';
import { apiFetch } from '../lib/api';
import { BuildingSlot } from '../components/BuildingSlot';
import { UpgradeDialog } from '../components/UpgradeDialog';
import { BuildDialog } from '../components/BuildDialog';
import { ResourceBar } from '../components/ResourceBar';
import { BuildQueue } from '../components/BuildQueue';
import {
  BIOME_META,
  CosmicBackground,
  CosmicBottomNav,
  PlanetPortrait,
  PlanetRail,
  resolveBiome,
} from '../components/cosmic/atoms';
import type { Building, Planet } from '@shared/types/world';
import type { BuildingType, BuildBlockedReason, ConstructionStatus, DemolishStatus } from '@shared/types/buildings';
import { resolveBuildBlockedReason } from '@shared/types/building-eligibility';
import { BUILDING_RESEARCH_GATES } from '@shared/config/buildingResearchGates';
import { ChevronLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { formatHomeSystemTitleForUser } from '../lib/homeSystemTitle';

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

  const [buildingTypes, setBuildingTypes] = useState<BuildingType[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
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

  // Handle deep-link to a specific slot
  useEffect(() => {
    const slotParam = queryParams.get('slot');
    if (slotParam !== null && planet && buildingTypes.length > 0) {
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
    }
  }, [queryParams, planet, buildingTypes]);

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

  const blockedReasonForType = useCallback(
    (typeId: string): BuildBlockedReason | null => {
      const typeRow = buildingTypes.find((t) => t.id === typeId);
      if (!typeRow || !planet) return null;
      const planetBuilt =
        planet.buildings?.map((b) => ({ typeId: b.typeId, level: b.level })) ?? [];
      const blocked = resolveBuildBlockedReason({
        typeId: typeRow.id,
        deps: typeRow.deps ?? [],
        maxPerPlanet: typeRow.maxPerPlanet ?? null,
        maxGlobal: typeRow.maxGlobal ?? null,
        planetBuildings: planetBuilt,
        globalCountForType: globalTypeCounts[typeRow.id] ?? 0,
        researchLevels,
        researchGate: BUILDING_RESEARCH_GATES[typeRow.id],
      });
      if (blocked) return blocked;

      if (typeRow.id === 'refinery') {
        const hasOilDeposit = (planet.resources ?? []).some((res) => res.resourceId === 'oil');
        if (!hasOilDeposit) {
          return {
            code: 'building_blocked_planet_resource',
            details: { resourceId: 'oil' },
          };
        }
      }
      return null;
    },
    [buildingTypes, planet, globalTypeCounts, researchLevels],
  );
  const currentEnergy = useMemo(() => {
    if (!planet) return { produced: 0, consumed: 0 };
    const byId = new Map(buildingTypes.map((t) => [t.id, t]));
    let produced = 0;
    let consumed = 0;
    for (const b of planet.buildings ?? []) {
      if (b.queueAction === 'build') continue;
      const type = byId.get(b.typeId);
      if (!type) continue;
      produced += (type.baseOutput?.energy ?? 0) * Math.max(1, b.level ?? 1);
      consumed += (type.energyConsumption ?? 0) * Math.max(1, b.level ?? 1);
    }
    return { produced, consumed };
  }, [planet, buildingTypes]);

  if (!planet) {
    return (
      <div
        className="cosmic-screen"
        style={{ '--accent': '#5BD7FF', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties}
      >
        <p style={{ color: 'var(--text-dim)' }}>Planet not found…</p>
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

  const handleBuild = async (typeId: string) => {
    if (selectedSlot === null) return;
    setIsProcessing(true);

    const previousMeData = queryClient.getQueryData(['me']);
    const typeInfo = buildingTypes.find((t) => t.id === typeId);

    if (meData && typeInfo) {
      const optimisticMe = structuredClone(meData);
      const p = optimisticMe.planets?.find((pl) => pl.id === planet.id);
      if (p) {
        p.buildings = p.buildings || [];
        p.buildings.push({
          id: 'temp-' + Date.now(),
          planetId: planet.id,
          typeId,
          level: 1,
          slotIndex: selectedSlot,
          queueAction: 'build',
        });
      }
      queryClient.setQueryData(['me'], optimisticMe);
    }

    try {
      await apiFetch<ConstructionStatus>('/buildings/build', {
        method: 'POST',
        body: JSON.stringify({
          planetId: planet.id,
          typeId,
          slotIndex: selectedSlot,
        }),
      });
      setSelectedSlot(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start building';
      alert(message);
      queryClient.setQueryData(['me'], previousMeData);
    } finally {
      setIsProcessing(false);
      queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  };

  const handleUpgrade = async (buildingId: string) => {
    setIsProcessing(true);

    const previousMeData = queryClient.getQueryData(['me']);

    if (meData) {
      const optimisticMe = structuredClone(meData);
      const p = optimisticMe.planets?.find((pl) => pl.id === planet.id);
      if (p) {
        const b = p.buildings?.find((bld) => bld.id === buildingId);
        if (b) {
          b.queueAction = 'upgrade';
        }
      }
      queryClient.setQueryData(['me'], optimisticMe);
    }

    try {
      await apiFetch<ConstructionStatus>('/buildings/upgrade', {
        method: 'POST',
        body: JSON.stringify({ buildingId }),
      });
      setSelectedBuilding(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start upgrade';
      alert(message);
      queryClient.setQueryData(['me'], previousMeData);
    } finally {
      setIsProcessing(false);
      queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  };

  const handleDemolish = async (buildingId: string) => {
    if (!window.confirm('Are you sure you want to demolish this building? You will only get 50% of the resources back.')) {
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
      const message = err instanceof Error ? err.message : 'Failed to demolish building';
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

  const systemName = meData ? formatHomeSystemTitleForUser(meData) : 'Home System';
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
            aria-label="Back"
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
              planets={allPlanets.map((p) => ({ id: p.id, name: p.name, biome: p.biome }))}
              current={planet.id}
              onSelect={(id) => navigate(`/planet/${id}`)}
            />
          </div>

          <div className="slots-section">
            <div className="section-head">
              <div className="section-title">INSTALLATIONS</div>
              <div className="section-count">
                {usedSlots}/{slotCount} slots
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
                Colonizer required before installations unlock
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
        accent={accent}
        planetLabel={`${planet.name} · ${BIOME_META[biome].label}`}
        currentEnergy={currentEnergy}
      />

      <UpgradeDialog
        isOpen={selectedBuilding !== null}
        onClose={() => setSelectedBuilding(null)}
        building={selectedBuilding || undefined}
        typeInfo={selectedBuildingType}
        onAction={handleUpgrade}
        onDemolish={handleDemolish}
        onOpenShipyard={() => navigate('/ships?tab=shipyard')}
        isProcessing={isProcessing}
        accent={accent}
      />
    </div>
  );
}
