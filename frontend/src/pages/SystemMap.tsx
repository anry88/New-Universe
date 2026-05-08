import { useNavigate } from 'react-router-dom';
import { useMe } from '../hooks/useMe';
import { SystemRenderer } from '../components/pixi/SystemRenderer';
import { ChevronLeft } from 'lucide-react';

export function SystemMapPage() {
  const { data: meData, isLoading } = useMe();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500"></div>
      </div>
    );
  }

  if (!meData?.homeSystem) {
    return (
      <div className="h-screen bg-slate-900 flex flex-col items-center justify-center text-white px-6 text-center">
        <p className="text-slate-400 mb-4">No home system found.</p>
        <button 
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-slate-800 rounded-lg"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-900 relative overflow-hidden flex flex-col">
      {/* Header UI */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 pointer-events-none">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="p-2 bg-slate-800/80 backdrop-blur-sm rounded-full text-white pointer-events-auto active:scale-95 transition-transform"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          
          <div className="bg-slate-800/80 backdrop-blur-sm px-4 py-2 rounded-2xl text-center pointer-events-auto">
            <h1 className="text-white font-bold text-sm leading-tight">
              {meData.homeSystem.name}
            </h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">
              Sector {meData.homeSystem.sectorX}:{meData.homeSystem.sectorY}:{meData.homeSystem.sectorZ}
            </p>
          </div>

          <div className="w-10" /> {/* Spacer */}
        </div>
      </div>

      {/* Pixi Canvas */}
      <div className="flex-1">
        <SystemRenderer
          system={meData.homeSystem}
          ships={meData.ships || []}
          expeditions={meData.expeditions || []}
          onPlanetClick={(planet) => navigate(`/planet/${planet.id}`)}
        />
      </div>

      {/* Footer info */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none">
        <div className="bg-slate-800/50 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full">
          <p className="text-[10px] text-slate-300 font-medium whitespace-nowrap">
            SCROLL TO ZOOM • DRAG TO PAN • TAP PLANETS
          </p>
        </div>
      </div>
    </div>
  );
}
