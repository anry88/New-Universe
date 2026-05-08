import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMe } from '../hooks/useMe';
import { apiFetch } from '../lib/api';
import { BuildingSlot } from '../components/BuildingSlot';
import { UpgradeDialog } from '../components/UpgradeDialog';
import { BuildDialog } from '../components/BuildDialog';
import type { Planet, Building } from '@shared/types/world';
import type { BuildingType, ConstructionStatus } from '@shared/types/buildings';
import { ArrowLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

export function PlanetDetailPage() {
  const { planetId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: meData } = useMe();
  
  const [buildingTypes, setBuildingTypes] = useState<BuildingType[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    apiFetch<BuildingType[]>('/buildings/types')
      .then(setBuildingTypes)
      .catch(console.error);
  }, []);

  const planet = useMemo(() => {
    if (!planetId || !meData?.homeSystem?.planets) return null;
    return meData.homeSystem.planets.find(p => p.id === planetId);
  }, [meData, planetId]);

  if (!planet) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <p className="text-slate-400">Planet not found...</p>
      </div>
    );
  }

  const handleSlotClick = (index: number, building?: Building) => {
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
    const typeInfo = buildingTypes.find(t => t.id === typeId);
    
    if (meData && typeInfo) {
      const optimisticMe = JSON.parse(JSON.stringify(meData));
      const p = optimisticMe.homeSystem.planets.find((p: any) => p.id === planet.id);
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
    } catch (err: any) {
      alert(err.message);
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
      const optimisticMe = JSON.parse(JSON.stringify(meData));
      const p = optimisticMe.homeSystem.planets.find((p: any) => p.id === planet.id);
      if (p) {
        const b = p.buildings.find((b: any) => b.id === buildingId);
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
    } catch (err: any) {
      alert(err.message);
      queryClient.setQueryData(['me'], previousMeData);
    } finally {
      setIsProcessing(false);
      queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  };

  const selectedBuildingType = selectedBuilding 
    ? buildingTypes.find(t => t.id === selectedBuilding.typeId)
    : undefined;

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-slate-800 transition-colors">
          <ArrowLeft size={24} />
        </button>
        <div>
          <h2 className="text-xl font-bold">{planet.name}</h2>
          <p className="text-xs text-slate-400 capitalize">{planet.biome} • Size {planet.size}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 pb-24">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8 p-6 bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl border border-slate-700 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-blue-600/20 transition-colors"></div>
            <div className="relative flex items-center gap-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-4xl shadow-lg shadow-blue-900/40">
                🌍
              </div>
              <div className="flex-1">
                <p className="text-slate-400 text-sm font-medium mb-1">Planet Status</p>
                <div className="flex gap-4">
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Slots</p>
                    <p className="text-lg font-mono text-white">{planet.buildings?.length || 0} / {planet.slotCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Type</p>
                    <p className="text-lg font-mono text-white capitalize">{planet.biome}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 px-1">Infrastructure Slots</h3>
          <div className="grid grid-cols-2 xs:grid-cols-3 gap-3">
            {Array.from({ length: planet.slotCount }, (_, i) => {
              const building = planet.buildings?.find(b => b.slotIndex === i);
              return (
                <BuildingSlot
                  key={i}
                  index={i}
                  building={building}
                  onClick={handleSlotClick}
                />
              );
            })}
          </div>
        </div>
      </div>

      <BuildDialog
        isOpen={selectedSlot !== null}
        onClose={() => setSelectedSlot(null)}
        types={buildingTypes}
        onAction={handleBuild}
        isProcessing={isProcessing}
      />

      <UpgradeDialog
        isOpen={selectedBuilding !== null}
        onClose={() => setSelectedBuilding(null)}
        building={selectedBuilding || undefined}
        typeInfo={selectedBuildingType}
        onAction={handleUpgrade}
        isProcessing={isProcessing}
      />
    </div>
  );
}
