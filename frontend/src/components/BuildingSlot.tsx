import React from 'react';
import type { Building } from '@shared/types/world';

interface BuildingSlotProps {
  index: number;
  building?: Building;
  onClick: (index: number, building?: Building) => void;
}

export const BuildingSlot: React.FC<BuildingSlotProps> = ({ index, building, onClick }) => {
  return (
    <button
      className={`p-4 rounded-xl border-2 transition-all hover:scale-105 min-h-[100px] flex flex-col items-center justify-center ${
        building
          ? building.queueAction 
            ? 'bg-slate-700/50 border-blue-400 border-dashed animate-pulse'
            : 'bg-slate-700 border-blue-500'
          : 'bg-slate-800/50 border-slate-600 border-dashed hover:border-slate-400'
      }`}
      onClick={() => onClick(index, building)}
    >
      {building ? (
        <div className="text-center">
          <p className="text-2xl mb-1">
            {building.typeId === 'command_center' ? '🏢' : 
             building.typeId === 'mine' ? '⛏️' : 
             building.typeId === 'power_plant' ? '⚡' : '🏭'}
          </p>
          <p className="text-xs font-bold text-slate-300 uppercase truncate max-w-[80px]">
            {building.typeId.replace('_', ' ')}
          </p>
          <p className="text-xs text-blue-400 font-mono">Lv.{building.level}</p>
          {building.queueAction && (
            <div className="mt-1 px-1.5 py-0.5 bg-blue-500/20 rounded text-[10px] text-blue-300 font-bold uppercase">
              {building.queueAction}ing
            </div>
          )}
        </div>
      ) : (
        <div className="text-center">
          <p className="text-slate-500 text-2xl mb-1">+</p>
          <p className="text-slate-500 text-[10px] font-bold uppercase">Empty Slot</p>
        </div>
      )}
    </button>
  );
};
