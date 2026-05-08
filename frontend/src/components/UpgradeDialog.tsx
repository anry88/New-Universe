import React from 'react';
import type { Building } from '@shared/types/world';
import type { BuildingType } from '@shared/types/buildings';
import { X } from 'lucide-react';

interface UpgradeDialogProps {
  building?: Building;
  typeInfo?: BuildingType;
  isOpen: boolean;
  onClose: () => void;
  onAction: (buildingId: string) => void;
  isProcessing: boolean;
}

export const UpgradeDialog: React.FC<UpgradeDialogProps> = ({
  building,
  typeInfo,
  isOpen,
  onClose,
  onAction,
  isProcessing,
}) => {
  if (!isOpen || !building || !typeInfo) return null;

  const multiplier = Math.pow(2, building.level);
  const costs = Object.entries(typeInfo.baseCost).map(([resId, amount]) => ({
    resId,
    amount: Math.floor(amount * multiplier),
  }));

  const buildTime = Math.floor(typeInfo.baseTimeSec * multiplier);
  const minutes = Math.floor(buildTime / 60);
  const seconds = buildTime % 60;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-800 rounded-t-2xl sm:rounded-2xl border border-slate-700 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>🏭</span> Upgrade {typeInfo.name.en}
          </h3>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-slate-700 text-slate-400"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-xl bg-slate-700 flex items-center justify-center text-3xl">
              🏭
            </div>
            <div>
              <p className="text-slate-400 text-sm">{typeInfo.category}</p>
              <p className="text-white font-bold">Level {building.level} → {building.level + 1}</p>
              <p className="text-xs text-slate-500 mt-1">Time: {minutes}m {seconds}s</p>
            </div>
          </div>

          <div className="mb-6">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Upgrade Cost</h4>
            <div className="grid grid-cols-2 gap-2">
              {costs.map(({ resId, amount }) => (
                <div key={resId} className="flex items-center justify-between px-3 py-2 bg-slate-900/50 rounded-lg border border-slate-700/50">
                  <span className="text-xs text-slate-400 capitalize">{resId.replace('_', ' ')}</span>
                  <span className="text-xs font-mono text-white">{amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => onAction(building.id)}
            disabled={isProcessing}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
              isProcessing
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 active:scale-95'
            }`}
          >
            {isProcessing ? 'Processing...' : 'Upgrade'}
          </button>
        </div>
      </div>
    </div>
  );
};
