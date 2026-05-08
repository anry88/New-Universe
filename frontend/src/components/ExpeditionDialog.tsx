import { Ship, ShipType } from '@shared/types/ships';
import { useLaunchExpedition } from '../hooks/useExpeditions';
import { X, Send, Navigation, Fuel, Box, Timer, Target } from 'lucide-react';
import { useState, useMemo } from 'react';

interface ExpeditionDialogProps {
  ship: Ship;
  shipType: ShipType;
  originX: number;
  originY: number;
  originZ: number;
  onClose: () => void;
}

export function ExpeditionDialog({ ship, shipType, originX, originY, originZ, onClose }: ExpeditionDialogProps) {
  const [target, setTarget] = useState({ x: originX + 10, y: originY + 10, z: originZ });
  const [fuel, setFuel] = useState(10);
  const [cargo, setCargo] = useState(0);
  const launch = useLaunchExpedition();

  const distance = useMemo(() => {
    return Math.sqrt(
      Math.pow(target.x - originX, 2) +
      Math.pow(target.y - originY, 2) +
      Math.pow(target.z - originZ, 2)
    );
  }, [target, originX, originY, originZ]);

  const etaSeconds = useMemo(() => {
    const speed = Number(shipType.speed);
    if (speed <= 0) return 0;
    return Math.max(0, Math.ceil((distance * 60 / speed)));
  }, [distance, shipType.speed]);

  const handleLaunch = async () => {
    try {
      await launch.mutateAsync({
        shipId: ship.id,
        targetX: target.x,
        targetY: target.y,
        targetZ: target.z,
        fuelLoaded: fuel,
        cargoLoaded: cargo
      });
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  const gridRange = 50;
  const gridCells = 10;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-white/10 w-full max-w-2xl rounded-[2.5rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="p-8">
          <div className="flex justify-between items-start mb-8">
            <div className="flex gap-5">
              <div className="p-4 bg-blue-600/20 rounded-3xl text-blue-400 ring-1 ring-blue-400/30">
                <Navigation className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-2xl font-black tracking-tight">Expedition Launch</h3>
                <p className="text-slate-400 font-medium">{shipType.name.en} <span className="text-slate-600 font-mono text-xs ml-2">ID: {ship.id.slice(0, 8)}</span></p>
              </div>
            </div>
            <button onClick={onClose} className="p-3 hover:bg-white/5 rounded-full text-slate-500 transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
            {/* Left: Interactive Map/Controls */}
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-end mb-3">
                  <label className="text-[10px] text-slate-500 uppercase font-black tracking-[0.2em]">Target Sector</label>
                  <span className="text-xs font-mono text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-md">[{target.x}, {target.y}, {target.z}]</span>
                </div>
                
                {/* Mini Visual Grid */}
                <div className="aspect-square bg-slate-950 rounded-3xl border border-white/5 relative overflow-hidden group cursor-crosshair mb-4"
                     onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const px = (e.clientX - rect.left) / rect.width;
                        const py = (e.clientY - rect.top) / rect.height;
                        setTarget({
                            ...target,
                            x: Math.round(originX + (px - 0.5) * gridRange * 2),
                            y: Math.round(originY + (py - 0.5) * gridRange * 2)
                        });
                     }}
                >
                    <div className="absolute inset-0 opacity-10 pointer-events-none" 
                         style={{ 
                            backgroundImage: 'radial-gradient(circle, #3b82f6 1px, transparent 1px)', 
                            backgroundSize: '20px 20px' 
                         }} 
                    />
                    {/* Origin */}
                    <div className="absolute left-1/2 top-1/2 w-3 h-3 bg-white rounded-full -translate-x-1/2 -translate-y-1/2 blur-sm opacity-50" />
                    <div className="absolute left-1/2 top-1/2 w-1.5 h-1.5 bg-white rounded-full -translate-x-1/2 -translate-y-1/2" />
                    
                    {/* Target */}
                    <div className="absolute w-6 h-6 border border-blue-400/50 rounded-full -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-out flex items-center justify-center"
                         style={{ 
                            left: `${50 + ((target.x - originX) / (gridRange * 2)) * 100}%`,
                            top: `${50 + ((target.y - originY) / (gridRange * 2)) * 100}%`
                         }}
                    >
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping absolute" />
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                        <Target className="w-full h-full text-blue-400/20" />
                    </div>
                    
                    {/* Trajectory Line */}
                    <svg className="absolute inset-0 pointer-events-none w-full h-full">
                        <line 
                            x1="50%" y1="50%" 
                            x2={`${50 + ((target.x - originX) / (gridRange * 2)) * 100}%`}
                            y2={`${50 + ((target.y - originY) / (gridRange * 2)) * 100}%`}
                            stroke="#3b82f6" strokeWidth="1" strokeDasharray="4 2" opacity="0.3"
                        />
                    </svg>
                </div>

                <div className="grid grid-cols-3 gap-3">
                    {['x', 'y', 'z'].map(axis => (
                        <div key={axis} className="bg-slate-950/50 rounded-2xl p-3 border border-white/5 flex flex-col">
                            <span className="text-[8px] text-slate-600 uppercase font-black mb-1">{axis}-axis</span>
                            <input 
                                type="number" 
                                value={target[axis as keyof typeof target]} 
                                onChange={e => setTarget({...target, [axis]: parseInt(e.target.value) || 0})}
                                className="bg-transparent text-sm font-mono w-full focus:outline-none text-slate-200"
                            />
                        </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Right: Mission Stats */}
            <div className="flex flex-col gap-6">
                <div className="bg-slate-950/80 rounded-[2rem] border border-white/5 p-6 flex-1 flex flex-col">
                    <h4 className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-6 flex items-center gap-2">
                        <Navigation className="w-3 h-3" /> Mission Summary
                    </h4>
                    
                    <div className="space-y-6 flex-1">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-400/10 rounded-lg"><Box className="w-4 h-4 text-blue-400" /></div>
                                <span className="text-sm text-slate-400">Distance</span>
                            </div>
                            <span className="text-lg font-mono font-bold">{distance.toFixed(1)} <span className="text-xs text-slate-600">ly</span></span>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-400/10 rounded-lg"><Timer className="w-4 h-4 text-amber-400" /></div>
                                <span className="text-sm text-slate-400">Travel Time</span>
                            </div>
                            <span className="text-lg font-mono font-bold text-amber-400">
                                {Math.floor(etaSeconds / 60)}m {etaSeconds % 60}s
                            </span>
                        </div>

                        <div className="pt-6 border-t border-white/5 space-y-4">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-400/10 rounded-lg"><Fuel className="w-4 h-4 text-emerald-400" /></div>
                                    <span className="text-sm text-slate-400">Fuel Allocation</span>
                                </div>
                                <span className="text-lg font-mono font-bold text-emerald-400">{fuel} <span className="text-xs text-slate-600">u</span></span>
                            </div>
                            <input 
                                type="range" min="1" max={Math.floor(Number(ship.fuel) || 100)} value={fuel} 
                                onChange={e => setFuel(parseInt(e.target.value))}
                                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                            />
                        </div>
                    </div>

                    <div className="mt-8 p-4 bg-blue-600/10 rounded-2xl border border-blue-500/20">
                        <p className="text-[11px] text-blue-300/80 leading-relaxed font-medium">
                            The ship will enter 'in_flight' status. You can monitor its progress in real-time on the System Map.
                        </p>
                    </div>
                </div>

                <button
                    onClick={handleLaunch}
                    disabled={launch.isPending}
                    className="w-full py-5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black text-lg rounded-3xl transition-all shadow-2xl shadow-blue-600/20 flex items-center justify-center gap-3 active:scale-[0.98]"
                >
                    {launch.isPending ? 'Preparing FTL...' : (
                        <><Send className="w-6 h-6" /> COMMENCE MISSION</>
                    )}
                </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
