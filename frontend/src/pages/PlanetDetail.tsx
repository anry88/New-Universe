import React, { useState, useEffect, useMemo } from 'react';
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
import type { BuildingType, ConstructionStatus } from '@shared/types/buildings';
import { ChevronLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

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
    () => meData?.homeSystem?.planets ?? [],
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

  const handleSlotClick = (index: number, building?: Building) => {
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
      const p = optimisticMe.homeSystem?.planets?.find((pl) => pl.id === planet.id);
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
      const p = optimisticMe.homeSystem?.planets?.find((pl) => pl.id === planet.id);
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

  const selectedBuildingType = selectedBuilding
    ? buildingTypes.find((t) => t.id === selectedBuilding.typeId)
    : undefined;

  const systemName = meData?.homeSystem?.name ?? 'Home System';
  const sectorTag = meData?.homeSystem
    ? `${meData.homeSystem.sectorX ?? 0}:${meData.homeSystem.sectorY ?? 0}:${meData.homeSystem.sectorZ ?? 0}`
    : '';

  return (
    <div className="cosmic-screen" style={{ '--accent': accent } as React.CSSProperties}>
      <CosmicBackground accent={accent} starSeed={planet.id.charCodeAt(0) || 7} />

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <ResourceBar planetId={planet.id} />

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
          </div>
          <div style={{ height: 80 }} />
        </div>

        <BuildQueue />
        <CosmicBottomNav active="planets" />
      </div>

      <BuildDialog
        isOpen={selectedSlot !== null}
        onClose={() => setSelectedSlot(null)}
        types={buildingTypes}
        onAction={handleBuild}
        isProcessing={isProcessing}
        accent={accent}
        planetLabel={`${planet.name} · ${BIOME_META[biome].label}`}
      />

      <UpgradeDialog
        isOpen={selectedBuilding !== null}
        onClose={() => setSelectedBuilding(null)}
        building={selectedBuilding || undefined}
        typeInfo={selectedBuildingType}
        onAction={handleUpgrade}
        isProcessing={isProcessing}
        accent={accent}
      />
    </div>
  );
}
