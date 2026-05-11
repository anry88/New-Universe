import React, { useState, useMemo } from 'react';
import { useColonies } from '../hooks/useColonies';
import { useShipTypes } from '../hooks/useShips';
import { useMe } from '../hooks/useMe';
import { Planet } from '@shared/types/world';
import { apiFetch } from '../lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Package, Truck, AlertTriangle } from 'lucide-react';
import { useI18n } from '../lib/i18n';

interface CargoTransferDialogProps {
  originPlanet: Planet;
  onClose: () => void;
}

export function CargoTransferDialog({ originPlanet, onClose }: CargoTransferDialogProps) {
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();
  const { data: meData } = useMe();
  const { planets } = useColonies();
  const { data: shipTypes } = useShipTypes();
  
  const [selectedShipId, setSelectedShipId] = useState<string>('');
  const [targetPlanetId, setTargetPlanetId] = useState<string>('');
  const [cargo, setCargo] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const availableShips = useMemo(() => 
    meData?.ships?.filter(s => s.locationPlanetId === originPlanet.id && s.status === 'idle') || []
  , [meData?.ships, originPlanet.id]);

  const targetPlanets = useMemo(() => 
    planets.filter(p => p.id !== originPlanet.id)
  , [planets, originPlanet.id]);
  
  const selectedShip = availableShips.find(s => s.id === selectedShipId);
  const selectedShipType = selectedShip && shipTypes?.find(t => t.id === selectedShip.typeId);

  const totalCargo = Object.values(cargo).reduce((a, b) => a + b, 0);
  const capacity = selectedShipType?.cargo || 0;

  const transferMutation = useMutation({
    mutationFn: (body: { shipId: string; targetPlanetId: string; resources: { resourceId: string; amount: number }[] }) => apiFetch('/cargo/transfer', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message || t('cargo.transferFailed'));
    }
  });

  const handleTransfer = () => {
    setError(null);
    if (!selectedShipId) return setError(t('cargo.selectShipError'));
    if (!targetPlanetId) return setError(t('cargo.selectTargetError'));
    if (totalCargo <= 0) return setError(t('cargo.addResourcesError'));
    if (totalCargo > capacity) return setError(t('cargo.capacityError'));

    transferMutation.mutate({
      shipId: selectedShipId,
      targetPlanetId,
      resources: Object.entries(cargo)
        .filter(([_, amount]) => amount > 0)
        .map(([resourceId, amount]) => ({
          resourceId,
          amount
        }))
    });
  };

  const updateResourceAmount = (resourceId: string, amount: number) => {
    const planetRes = originPlanet.resources?.find(r => r.resourceId === resourceId);
    const maxAvailable = planetRes ? Math.floor(Number(planetRes.amount)) : 0;
    const finalAmount = Math.max(0, Math.min(amount, maxAvailable));
    
    setCargo(prev => ({
      ...prev,
      [resourceId]: finalAmount
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/50">
          <div className="flex items-center gap-2 text-cyan-400 font-bold uppercase tracking-wider text-sm">
            <Truck className="w-5 h-5" />
            {t('cargo.title')}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded-lg text-slate-400 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-6 flex-1">
          {/* Ship Selection */}
          <section>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-tighter mb-2">{t('cargo.selectShip')}</label>
            <div className="grid gap-2">
              {availableShips.length > 0 ? (
                availableShips.map(ship => {
                  const type = shipTypes?.find(t => t.id === ship.typeId);
                  return (
                    <button
                      key={ship.id}
                      onClick={() => setSelectedShipId(ship.id)}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        selectedShipId === ship.id 
                          ? 'bg-cyan-500/10 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.1)]' 
                          : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <div className="text-left">
                        <div className="text-sm font-bold text-slate-200">{type?.name[locale] || t('cargo.unknownShip')}</div>
                        <div className="text-[10px] text-slate-400">{t('cargo.shipId', { id: ship.id.slice(0, 8) })}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-cyan-400 font-medium">{t('cargo.capacity', { capacity: type?.cargo || 0 })}</div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="text-center p-6 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
                  <p className="text-xs text-slate-500">{t('cargo.noIdleShips')}</p>
                </div>
              )}
            </div>
          </section>

          {/* Target Planet */}
          <section>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-tighter mb-2">{t('cargo.destination')}</label>
            <select
              value={targetPlanetId}
              onChange={(e) => setTargetPlanetId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-500 transition-colors"
            >
              <option value="">{t('cargo.selectColony')}</option>
              {targetPlanets.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </section>

          {/* Resource Selection */}
          <section>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-tighter mb-2">{t('cargo.load')}</label>
            <div className="space-y-2">
              {originPlanet.resources?.map(res => (
                <div key={res.resourceId} className="flex items-center gap-3 p-2 bg-slate-800/30 rounded-xl border border-slate-700/50">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700">
                     <Package className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider mb-1">
                      <span className="text-slate-400">{res.resourceId}</span>
                      <span className="text-slate-500">{t('cargo.available', { amount: Math.floor(Number(res.amount)) })}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max={Math.floor(Number(res.amount))}
                        value={cargo[res.resourceId] || 0}
                        onChange={(e) => updateResourceAmount(res.resourceId, parseInt(e.target.value))}
                        className="flex-1 accent-cyan-500 h-1"
                      />
                      <input
                        type="number"
                        min="0"
                        max={Math.floor(Number(res.amount))}
                        value={cargo[res.resourceId] || 0}
                        onChange={(e) => updateResourceAmount(res.resourceId, parseInt(e.target.value) || 0)}
                        className="w-16 bg-slate-900 border border-slate-700 rounded-lg py-0.5 text-center text-xs text-cyan-400 font-mono"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Validation & Errors */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-800/30 border-t border-slate-800">
          <div className="flex justify-between items-center mb-4 px-1">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('cargo.totalPayload')}</div>
            <div className={`text-sm font-bold ${totalCargo > capacity ? 'text-red-400' : 'text-cyan-400'}`}>
              {totalCargo} / {capacity}
            </div>
          </div>
          
          <button
            onClick={handleTransfer}
            disabled={transferMutation.isPending || !selectedShipId || !targetPlanetId || totalCargo <= 0 || totalCargo > capacity}
            className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-bold py-3 rounded-xl transition-all shadow-[0_4px_20px_rgba(6,182,212,0.2)]"
          >
            {transferMutation.isPending ? t('cargo.launching') : t('cargo.initiate')}
          </button>
        </div>
      </div>
    </div>
  );
}
