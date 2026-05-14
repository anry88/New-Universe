import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { ColonizationRequirements } from './ColonizationRequirements';
import { Rocket, Loader2 } from 'lucide-react';
import { Ship } from '@shared/types/ships';
import { useI18n } from '../lib/i18n';

interface FoundColonyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  planet: { id: string; name: string };
  onSuccess: () => void;
}

interface EligibilityResponse {
  eligibility: {
    allowed: boolean;
    reason?: string;
    details?: {
      currentColonies: number;
      maxColonies: number;
      cooldownRemainingSec: number;
      requiredResearch: { branch: string; level: number };
      currentResearch: number;
      distance?: number;
    };
  };
  rules: {
    foundingCost: Record<string, number>;
    maxColoniesPerLogisticsLevel: number;
  };
}

export const FoundColonyDialog: React.FC<FoundColonyDialogProps> = ({
  isOpen,
  onClose,
  planet,
  onSuccess,
}) => {
  const { t } = useI18n();
  const [data, setData] = useState<EligibilityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFounding, setIsFounding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      apiFetch<EligibilityResponse>(`/colonies/eligibility/${planet.id}`)
        .then((res) => {
          setData(res);
          setIsLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setIsLoading(false);
        });
    }
  }, [isOpen, planet.id]);

  const handleFound = async () => {
    setIsFounding(true);
    setError(null);
    try {
      // For now, we assume the user has at least one colonizer ship at the planet.
      // The backend will validate this.
      // We need to find a shipId.
      // In a real flow, the user might select a ship.
      // For now, we'll let the backend pick an available colonizer ship or we fetch ships first.
      
      const me = await apiFetch<{ user: { ships: Ship[] } }>('/me');
      const ships = me.user.ships;
      const colonizer = ships.find(s => s.locationPlanetId === planet.id && s.status === 'idle');
      
      if (!colonizer) {
        throw new Error(t('colonize.noIdleShip'));
      }

      await apiFetch('/colonies/found', {
        method: 'POST',
        body: JSON.stringify({
          shipId: colonizer.id,
          planetId: planet.id,
        }),
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsFounding(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-display font-bold text-white tracking-tight">
                {t('colonize.title').toUpperCase()}
              </h2>
              <p className="text-xs text-slate-400 font-mono uppercase tracking-widest mt-1">
                {t('colonize.establishOn', { planet: planet.name })}
              </p>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-xl text-blue-400">
              <Rocket className="w-6 h-6" />
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-4 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-xs font-mono uppercase tracking-widest">{t('colonize.checking')}</span>
            </div>
          ) : error && !data ? (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          ) : data ? (
            <div className="space-y-6">
              <ColonizationRequirements 
                eligibility={data.eligibility}
                costs={data.rules.foundingCost}
                maxColoniesPerLogisticsLevel={data.rules.maxColoniesPerLogisticsLevel}
              />

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-semibold text-sm hover:bg-slate-700 transition-colors"
                >
                  {t('common.abort').toUpperCase()}
                </button>
                <button
                  type="button"
                  data-testid="found-colony-button"
                  disabled={!data.eligibility.allowed || isFounding}
                  onClick={handleFound}
                  className={`flex-[2] py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                    data.eligibility.allowed && !isFounding
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20 hover:bg-blue-500 active:scale-95'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {isFounding ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Rocket className="w-4 h-4" />
                  )}
                  {isFounding ? t('colonize.founding').toUpperCase() : t('colonize.found').toUpperCase()}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
