import React, { useEffect, useRef, useState } from 'react';
import { useColonies } from '../hooks/useColonies';
import { CosmicBottomNav } from '../components/cosmic/atoms';
import { ResourceBar } from '../components/ResourceBar';
import { CargoTransferDialog } from '../components/CargoTransferDialog';
import { Planet } from '@shared/types/world';
import { Globe, Package, Navigation, ChevronRight } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useI18n } from '../lib/i18n';

export function ColoniesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const { planets, focalPlanetId, focalPlanet, setFocalPlanetId, isLoading } = useColonies();
  const [transferOrigin, setTransferOrigin] = useState<Planet | null>(null);
  const [transferShipId, setTransferShipId] = useState<string | null>(null);
  const [transferTargetPlanetId, setTransferTargetPlanetId] = useState<string | null>(null);
  const [transferUseJumpGateRoute, setTransferUseJumpGateRoute] = useState(false);
  const processedCargoSearchRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    const params = new URLSearchParams(location.search);
    const cargoOriginId = params.get('cargoOrigin');
    const cargoShipId = params.get('cargoShip');
    const cargoTargetId = params.get('cargoTarget');
    const cargoRoute = params.get('cargoRoute');
    if (!cargoOriginId) return;
    if (processedCargoSearchRef.current === location.search) return;

    const origin = planets.find((planet) => planet.id === cargoOriginId);
    if (!origin) {
      if (planets.length === 0) return;
      params.delete('cargoOrigin');
      params.delete('cargoShip');
      params.delete('cargoTarget');
      params.delete('cargoRoute');
      navigate(
        {
          pathname: location.pathname,
          search: params.toString() ? `?${params.toString()}` : '',
        },
        { replace: true },
      );
      return;
    }

    setFocalPlanetId(origin.id);
    setTransferShipId(cargoShipId);
    setTransferTargetPlanetId(cargoTargetId);
    setTransferUseJumpGateRoute(cargoRoute === 'jump_gate');
    setTransferOrigin(origin);
    processedCargoSearchRef.current = location.search;
  }, [isLoading, location.pathname, location.search, navigate, planets, setFocalPlanetId]);

  if (isLoading) {
    return (
      <div className="cosmic-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="cosmic-screen" style={{ '--accent': '#5BD7FF' } as React.CSSProperties}>
      <ResourceBar planetId={focalPlanetId || undefined} planetLabel={focalPlanet?.name} />

      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
        <header className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-white tracking-tight">{t('colonies.title')}</h1>
          <div className="text-xs text-slate-400 bg-slate-800/50 px-2 py-1 rounded-md border border-slate-700">
            {planets.length} {planets.length === 1 ? t('colonies.planetSingular') : t('colonies.planetPlural')}
          </div>
        </header>

        <div className="grid gap-4">
          {planets.length > 0 ? (
            planets.map((planet) => {
              const isActive = planet.id === focalPlanetId;
              return (
                <div
                  key={planet.id}
                  className={`relative overflow-hidden rounded-2xl border transition-all ${
                    isActive 
                      ? 'bg-slate-800 border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.1)]' 
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                          isActive ? 'bg-cyan-500/20 border-cyan-500/50' : 'bg-slate-800 border-slate-700'
                        }`}>
                          <Globe className={`w-6 h-6 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-100">{planet.name}</h3>
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest">{planet.biome}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isActive ? (
                          <button
                            onClick={() => setFocalPlanetId(planet.id)}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-[10px] font-bold text-slate-300 uppercase tracking-wider border border-slate-700 transition-colors"
                          >
                            {t('colonies.setFocal')}
                          </button>
                        ) : (
                          <span className="px-2 py-1 bg-cyan-500/10 text-cyan-400 text-[10px] font-bold uppercase rounded border border-cyan-500/20">{t('common.active')}</span>
                        )}
                        <button
                           onClick={() => navigate(`/planet/${planet.id}`)}
                           className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {/* Quick Resources */}
                    <div className="grid grid-cols-4 gap-2">
                      {planet.resources?.slice(0, 4).map(res => (
                        <div key={res.resourceId} className="bg-slate-950/50 rounded-lg p-2 border border-slate-800/50">
                           <div className="text-[8px] text-slate-500 uppercase font-bold mb-1 truncate">{res.resourceId}</div>
                           <div className="text-xs font-mono text-cyan-400">{Math.floor(Number(res.amount))}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="bg-slate-800/30 border-t border-slate-800/50 flex divide-x divide-slate-800/50">
                    <button
                      onClick={() => setTransferOrigin(planet)}
                      className="flex-1 py-2.5 flex items-center justify-center gap-2 text-[10px] font-bold text-slate-400 hover:text-cyan-400 transition-colors"
                    >
                      <Package className="w-3.5 h-3.5" />
                      {t('colonies.cargoTransfer')}
                    </button>
                    <button
                       onClick={() => navigate('/map')}
                       className="flex-1 py-2.5 flex items-center justify-center gap-2 text-[10px] font-bold text-slate-400 hover:text-cyan-400 transition-colors"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      {t('colonies.viewOnMap')}
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="w-20 h-20 rounded-full bg-slate-800/50 flex items-center justify-center border border-slate-700 border-dashed">
                <Globe className="w-10 h-10 text-slate-600" />
              </div>
              <div>
                <h3 className="text-slate-300 font-bold">{t('colonies.emptyTitle')}</h3>
                <p className="text-xs text-slate-500 max-w-[200px] mt-1">{t('colonies.emptyText')}</p>
              </div>
              <button
                onClick={() => navigate('/map')}
                className="px-6 py-2.5 bg-cyan-500 text-slate-950 font-bold rounded-xl text-xs hover:bg-cyan-400 transition-colors shadow-lg"
              >
                {t('colonies.goToMap')}
              </button>
            </div>
          )}
        </div>
      </div>

      {transferOrigin && (
        <CargoTransferDialog
          originPlanet={transferOrigin}
          initialShipId={transferShipId}
          initialTargetPlanetId={transferTargetPlanetId}
          initialUseJumpGateRoute={transferUseJumpGateRoute}
          onClose={() => {
            const params = new URLSearchParams(location.search);
            params.delete('cargoOrigin');
            params.delete('cargoShip');
            params.delete('cargoTarget');
            params.delete('cargoRoute');
            processedCargoSearchRef.current = null;
            setTransferOrigin(null);
            setTransferShipId(null);
            setTransferTargetPlanetId(null);
            setTransferUseJumpGateRoute(false);
            navigate(
              {
                pathname: location.pathname,
                search: params.toString() ? `?${params.toString()}` : '',
              },
              { replace: true },
            );
          }}
        />
      )}

      <CosmicBottomNav />
    </div>
  );
}
