import React from 'react';
import type { BuildingType } from '@shared/types/buildings';
import { X } from 'lucide-react';

interface BuildDialogProps {
  types: BuildingType[];
  isOpen: boolean;
  onClose: () => void;
  onAction: (typeId: string) => void;
  isProcessing: boolean;
}

export const BuildDialog: React.FC<BuildDialogProps> = ({
  types,
  isOpen,
  onClose,
  onAction,
  isProcessing,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-800 rounded-t-2xl sm:rounded-2xl border border-slate-700 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="text-lg font-bold text-white">Construct Building</h3>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-slate-700 text-slate-400"
          >
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-3">
          {types.map(type => (
            <button
              key={type.id}
              onClick={() => onAction(type.id)}
              disabled={isProcessing}
              className="w-full flex items-center gap-4 p-4 bg-slate-700/50 hover:bg-slate-700 rounded-xl border border-slate-600 transition-colors text-left disabled:opacity-50"
            >
              <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center text-2xl">
                {type.id === 'mine' ? '⛏️' : type.id === 'power_plant' ? '⚡' : '🏭'}
              </div>
              <div className="flex-1">
                <p className="font-bold text-white">{type.name.en}</p>
                <p className="text-xs text-slate-400 mb-2">{type.category}</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(type.baseCost).map(([resId, amount]) => (
                    <span key={resId} className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded text-slate-300 uppercase font-mono">
                      {resId[0]}:{amount}
                    </span>
                  ))}
                  <span className="text-[10px] bg-blue-900/30 px-1.5 py-0.5 rounded text-blue-300 uppercase font-mono">
                    Time:{type.baseTimeSec}s
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
