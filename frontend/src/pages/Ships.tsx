import { useState } from 'react';
import { useMe } from '../hooks/useMe';
import { useShipTypes } from '../hooks/useShips';
import { ExpeditionDialog } from '../components/ExpeditionDialog';
import { ResourceBar } from '../components/ResourceBar';
import { ChevronLeft, Rocket, Shield, Zap, Box, Send, Clock, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Ship, ShipType } from '@shared/types/ships';

export function ShipsPage() {
  const { data: meData } = useMe();
  const { data: shipTypes } = useShipTypes();
  const navigate = useNavigate();
  const [selectedShip, setSelectedShip] = useState<Ship | null>(null);

  const ships = meData?.ships || [];
  const origin = meData?.homeSystem || { sectorX: 0, sectorY: 0, sectorZ: 0 };

  const getShipType = (typeId: string) => shipTypes?.find(t => t.id === typeId);

  return (
    <div className="h-screen bg-slate-900 text-white flex flex-col overflow-hidden">
      <ResourceBar />

      <header className="p-6 flex items-center gap-6 bg-slate-800/30 backdrop-blur-xl border-b border-white/5">
        <button onClick={() => navigate('/')} className="p-3 hover:bg-white/10 rounded-2xl transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-2xl font-black tracking-tight">Fleet Command</h1>
          <p className="text-[10px] text-slate-500 uppercase font-black tracking-[0.2em]">{ships.length} Active Vessels</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          {ships.length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-500 gap-4 bg-slate-800/20 rounded-[3rem] border border-dashed border-white/5">
                <Rocket className="w-16 h-16 opacity-10" />
                <p className="font-medium">No ships available. Build them in the Shipyard.</p>
            </div>
          )}

          {ships.map(ship => {
            const type = getShipType(ship.typeId);
            const isIdle = ship.status === 'idle';
            const isActive = ship.status === 'moving' || ship.status === 'in_flight';

            return (
              <div key={ship.id} className="bg-slate-800/40 border border-white/5 rounded-[2.5rem] overflow-hidden hover:border-blue-500/30 transition-all group p-1">
                <div className="p-6">
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex gap-4">
                            <div className="p-4 bg-slate-900 rounded-3xl group-hover:scale-110 transition-transform">
                                <Rocket className={`w-8 h-8 ${isIdle ? 'text-blue-400' : 'text-amber-400'}`} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold">{type?.name.en || ship.typeId}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`w-2 h-2 rounded-full ${isIdle ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                                    <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">{ship.status}</span>
                                </div>
                            </div>
                        </div>
                        <span className="text-[10px] font-mono text-slate-600 bg-slate-900 px-3 py-1 rounded-full uppercase">#{ship.id.slice(0, 8)}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-8">
                        <div className="bg-slate-900/50 p-3 rounded-2xl border border-white/5">
                            <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                                <Shield className="w-3 h-3" />
                                <span className="text-[8px] font-black uppercase">Armor</span>
                            </div>
                            <p className="text-sm font-mono font-bold">{type?.armor || 0}</p>
                        </div>
                        <div className="bg-slate-900/50 p-3 rounded-2xl border border-white/5">
                            <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                                <Zap className="w-3 h-3" />
                                <span className="text-[8px] font-black uppercase">Speed</span>
                            </div>
                            <p className="text-sm font-mono font-bold">{type?.speed || 0}</p>
                        </div>
                        <div className="bg-slate-900/50 p-3 rounded-2xl border border-white/5">
                            <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                                <Box className="w-3 h-3" />
                                <span className="text-[8px] font-black uppercase">Cargo</span>
                            </div>
                            <p className="text-sm font-mono font-bold">{type?.cargo || 0}</p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button 
                            disabled={!isIdle}
                            onClick={() => setSelectedShip(ship)}
                            className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black rounded-2xl transition-all flex items-center justify-center gap-2"
                        >
                            <Send className="w-4 h-4" /> SEND MISSION
                        </button>
                        <button className="p-4 bg-slate-800 hover:bg-slate-700 rounded-2xl text-slate-400 transition-colors">
                            <Info className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {isActive && (
                    <div className="px-6 py-4 bg-amber-500/10 border-t border-amber-500/10 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-amber-500">
                            <Clock className="w-4 h-4 animate-spin-slow" />
                            <span className="text-[10px] font-black uppercase tracking-widest">In Transit</span>
                        </div>
                        <button onClick={() => navigate('/map')} className="text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300">View on Map</button>
                    </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {selectedShip && getShipType(selectedShip.typeId) && (
        <ExpeditionDialog
            ship={selectedShip}
            shipType={getShipType(selectedShip.typeId)!}
            originX={Number(origin.sectorX)}
            originY={Number(origin.sectorY)}
            originZ={Number(origin.sectorZ)}
            onClose={() => setSelectedShip(null)}
        />
      )}
    </div>
  );
}
