import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe } from '../hooks/useMe';
import type { Planet } from '@shared/types/world';

export function PlanetView() {
  const { data: meData } = useMe();
  const navigate = useNavigate();
  
  const currentPlanet = useMemo(() => {
    const homeSystem = meData?.homeSystem;
    if (!homeSystem?.planets?.length) return null;
    return homeSystem.planets[0];
  }, [meData]);

  if (!currentPlanet) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-400">Loading planet data...</p>
      </div>
    );
  }

  const planet = currentPlanet as Planet;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 text-center">
          <h2 className="text-xl font-bold text-white mb-1">{planet.name}</h2>
          <p className="text-sm text-slate-400 capitalize">
            {planet.biome} • Size {planet.size} • Slots {planet.slotCount}
          </p>
        </div>

        <div className="relative bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
          <div className="text-center mb-4">
            <span className="inline-block w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-3xl mb-2">
              🌍
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: planet.slotCount }, (_, i) => {
              const building = planet.buildings?.find((item) => item.slotIndex === i);
              return (
                <button
                  key={i}
                  className={`p-4 rounded-xl border-2 transition-all hover:scale-105 ${
                    building
                      ? 'bg-slate-700 border-blue-500'
                      : 'bg-slate-800/50 border-slate-600 border-dashed'
                  }`}
                  onClick={() => {
                    navigate(`/planet/${planet.id}`);
                  }}
                >
                  {building ? (
                    <div className="text-center">
                      <p className="text-lg mb-1">🏭</p>
                      <p className="text-xs text-slate-300">{building.typeId}</p>
                      <p className="text-xs text-slate-400">Lv.{building.level}</p>
                    </div>
                  ) : (
                    <p className="text-center text-slate-500 text-sm">Empty Slot</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
