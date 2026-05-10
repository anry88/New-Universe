import { Ship, ShipType } from '@shared/types/ships';
import { useLaunchExpedition } from '../hooks/useExpeditions';
import { useMe } from '../hooks/useMe';
import { X, Send, Navigation, Fuel, Box, Timer, Target, AlertTriangle } from 'lucide-react';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { CosmicBackground } from './cosmic/atoms';
import { CosmicSystemRenderer } from './cosmic/SystemMap';

interface ExpeditionDialogProps {
  ship: Ship;
  shipType: ShipType;
  originX: number;
  originY: number;
  originZ: number;
  onClose: () => void;
}

export function ExpeditionDialog({ ship, shipType, originX, originY, originZ, onClose }: ExpeditionDialogProps) {
  const { data: meData } = useMe();
  const [target, setTarget] = useState({ x: originX + 10, y: originY + 10, z: originZ });
  const [cargo] = useState(0);
  const [fuelManual, setFuelManual] = useState(false);
  const [fuel, setFuel] = useState(10);
  const launch = useLaunchExpedition();

  const homeSystem = meData?.homeSystem;
  const ownedPlanetIds = useMemo(() => new Set(meData?.planets?.map((p) => p.id) ?? []), [meData?.planets]);

  const shipPlanet = useMemo(
    () => meData?.planets?.find((p) => p.id === ship.locationPlanetId),
    [meData?.planets, ship.locationPlanetId],
  );
  const fuelAvailable = useMemo(() => {
    const row = shipPlanet?.resources?.find((r) => r.resourceId === 'fuel');
    return Math.floor(Number(row?.amount ?? 0));
  }, [shipPlanet?.resources]);

  const distance = useMemo(() => {
    return Math.sqrt(
      Math.pow(target.x - originX, 2) + Math.pow(target.y - originY, 2) + Math.pow(target.z - originZ, 2),
    );
  }, [target, originX, originY, originZ]);

  const etaSeconds = useMemo(() => {
    const speed = Number(shipType.speed);
    if (speed <= 0) return 0;
    return Math.max(0, Math.ceil((distance * 60) / speed));
  }, [distance, shipType.speed]);

  const recommendedFuel = useMemo(() => {
    const perLy = Number(shipType.fuelConsumption);
    if (!Number.isFinite(perLy) || perLy <= 0) return Math.max(1, Math.ceil(distance * 2));
    return Math.max(1, Math.ceil(2 * distance * perLy));
  }, [distance, shipType.fuelConsumption]);

  const idealFuel = useMemo(() => {
    if (fuelAvailable <= 0) return 0;
    return Math.min(recommendedFuel, fuelAvailable);
  }, [recommendedFuel, fuelAvailable]);

  useEffect(() => {
    if (!fuelManual) {
      setFuel(idealFuel);
    }
  }, [idealFuel, fuelManual]);

  const shortOnFuel = fuelAvailable > 0 && recommendedFuel > fuelAvailable;
  const launchBlocked = fuel <= 0 || fuel > fuelAvailable || fuelAvailable <= 0;

  const handleLaunch = async () => {
    try {
      await launch.mutateAsync({
        shipId: ship.id,
        targetX: target.x,
        targetY: target.y,
        targetZ: target.z,
        fuelLoaded: fuel,
        cargoLoaded: cargo,
      });
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  const onPickSectorDelta = useCallback(
    (dx: number, dy: number) => {
      setTarget((prev) => ({
        ...prev,
        x: originX + dx,
        y: originY + dy,
      }));
    },
    [originX, originY],
  );

  const sectorDx = target.x - originX;
  const sectorDy = target.y - originY;
  const sectorDz = target.z - originZ;

  const expeditionPick =
    ship.locationPlanetId && homeSystem
      ? {
          sectorDx,
          sectorDy,
          launchPlanetId: ship.locationPlanetId,
          onPickSectorDelta,
        }
      : undefined;

  return (
    <div
      className="animate-in fade-in duration-200"
      style={{
        position: 'fixed',
        inset: 0,
        /* Above `.bnav` (z-index 1000) and build-dialog sheets (1110); see `index.css` */
        zIndex: 1200,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(6, 10, 18, 0.94)',
        backdropFilter: 'blur(10px)',
        paddingTop: 'max(10px, env(safe-area-inset-top, 10px))',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))',
        paddingLeft: 'max(12px, env(safe-area-inset-left, 12px))',
        paddingRight: 'max(12px, env(safe-area-inset-right, 12px))',
        height: '100dvh',
        maxHeight: '100dvh',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
          <div
            style={{
              padding: 10,
              borderRadius: 16,
              background: 'rgba(91, 215, 255, 0.12)',
              border: '1px solid rgba(91, 215, 255, 0.35)',
              color: 'var(--accent)',
            }}
          >
            <Navigation size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--text)' }}>
              Expedition Launch
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              {shipType.name.en}{' '}
              <span style={{ fontFamily: 'var(--font-mono)', opacity: 0.75 }}>· {ship.id.slice(0, 8)}</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            padding: 10,
            borderRadius: 999,
            border: '1px solid var(--line)',
            background: 'rgba(14, 20, 36, 0.85)',
            color: 'var(--text-dim)',
          }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Single map: same system view as Galaxy — tap from star sets sector jump; trail from your planet */}
      <div
        style={{
          flex: '1 1 50%',
          minHeight: 160,
          position: 'relative',
          borderRadius: 16,
          overflow: 'hidden',
          border: '1px solid var(--line)',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <CosmicBackground accent="#5BD7FF" starSeed={11} />
        </div>
        {homeSystem ? (
          <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
            <CosmicSystemRenderer
              system={homeSystem}
              ships={meData?.ships ?? []}
              expeditions={meData?.expeditions ?? []}
              onPlanetClick={() => {}}
              ownedPlanetIds={ownedPlanetIds}
              expeditionPick={expeditionPick}
            />
          </div>
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1,
              display: 'grid',
              placeItems: 'center',
              color: 'var(--text-dim)',
              fontSize: 13,
            }}
          >
            Loading system…
          </div>
        )}
      </div>

      <div style={{ flex: '0 1 auto', maxHeight: '42%', overflowY: 'auto', marginTop: 10, paddingBottom: 4 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10, lineHeight: 1.45 }}>
          <strong style={{ color: 'var(--text)' }}>Aim from the star</strong> — tap where you want to go (distance follows how far you tap from the center).
          Orbits and your ship sit in this plane; use ΔZ for “above/below” the grid.
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid var(--line)',
              background: 'rgba(14,20,36,0.75)',
              flex: '1 1 auto',
              minWidth: 200,
            }}
          >
            <span style={{ color: 'var(--text-faint)', letterSpacing: '0.12em', fontSize: 9 }}>TARGET SECTOR</span>
            <div style={{ color: 'var(--accent)', marginTop: 4 }}>
              [{target.x}, {target.y}, {target.z}]
            </div>
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid var(--line)',
              background: 'rgba(14,20,36,0.75)',
              flex: '1 1 auto',
              minWidth: 160,
            }}
          >
            <span style={{ color: 'var(--text-faint)', letterSpacing: '0.12em', fontSize: 9 }}>Δ FROM HOME</span>
            <div style={{ color: 'var(--text)', marginTop: 4 }}>
              [{sectorDx >= 0 ? '+' : ''}
              {sectorDx}, {sectorDy >= 0 ? '+' : ''}
              {sectorDy}, {sectorDz >= 0 ? '+' : ''}
              {sectorDz}]
            </div>
          </div>
        </div>

        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid var(--line)',
            background: 'rgba(10,14,26,0.65)',
          }}
        >
          <span style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-faint)' }}>ΔZ (galactic height)</span>
          <input
            type="number"
            step={1}
            value={target.z}
            onChange={(e) => setTarget({ ...target, z: Number.parseInt(e.target.value, 10) || 0 })}
            style={{
              background: 'rgba(6,10,18,0.9)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: '8px 10px',
              color: 'var(--text)',
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
        </label>

        <div
          style={{
            padding: 14,
            borderRadius: 16,
            border: '1px solid var(--line)',
            background: 'rgba(10,14,26,0.75)',
          }}
        >
          <div style={{ fontSize: 10, letterSpacing: '0.18em', color: 'var(--text-faint)', marginBottom: 12, fontWeight: 700 }}>
            MISSION SUMMARY
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: 13 }}>
                <Box size={16} style={{ opacity: 0.85 }} /> Distance
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16 }}>
                {distance.toFixed(1)} <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>ly</span>
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: 13 }}>
                <Timer size={16} style={{ opacity: 0.85 }} /> One-way ETA
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: '#fbbf24' }}>
                {Math.floor(etaSeconds / 60)}m {etaSeconds % 60}s
              </span>
            </div>
            <div style={{ borderTop: '1px solid rgba(148,163,184,0.12)', paddingTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: 13 }}>
                  <Fuel size={16} style={{ opacity: 0.85 }} /> Fuel (round-trip est.)
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: '#6ee7b7' }}>
                  {fuel} <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>/ {fuelAvailable} avail.</span>
                </span>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.45 }}>
                Auto: <strong style={{ color: 'var(--text)' }}>{recommendedFuel}</strong> units (2×{' '}
                {distance.toFixed(1)} ly × {Number(shipType.fuelConsumption).toFixed(2)} / ly). Capped by planet stock.
              </div>
              {shortOnFuel ? (
                <div
                  style={{
                    marginTop: 10,
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                    padding: 10,
                    borderRadius: 12,
                    background: 'rgba(251, 191, 36, 0.08)',
                    border: '1px solid rgba(251, 191, 36, 0.35)',
                    color: '#fcd34d',
                    fontSize: 12,
                  }}
                >
                  <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>Recommended fuel exceeds stored fuel. Gather fuel or shorten the route.</span>
                </div>
              ) : null}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12, color: 'var(--text-dim)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={fuelManual}
                  onChange={(e) => {
                    setFuelManual(e.target.checked);
                  }}
                />
                Adjust fuel manually
              </label>
              {fuelManual ? (
                <input
                  type="range"
                  min={1}
                  max={Math.max(1, fuelAvailable)}
                  value={Math.min(fuel, Math.max(1, fuelAvailable))}
                  onChange={(e) => setFuel(Number(e.target.value))}
                  style={{ width: '100%', marginTop: 10, accentColor: 'var(--accent)' }}
                />
              ) : null}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLaunch}
          disabled={launch.isPending || launchBlocked}
          style={{
            width: '100%',
            marginTop: 12,
            padding: '14px 16px',
            borderRadius: 16,
            border: 'none',
            fontWeight: 800,
            fontSize: 15,
            cursor: launch.isPending || launchBlocked ? 'not-allowed' : 'pointer',
            background: launchBlocked ? 'rgba(51,65,85,0.6)' : 'linear-gradient(135deg, #2563eb, #4f46e5)',
            color: launchBlocked ? 'var(--text-faint)' : '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            boxShadow: launchBlocked ? 'none' : '0 12px 28px rgba(37,99,235,0.35)',
          }}
        >
          {launch.isPending ? (
            'Preparing…'
          ) : launchBlocked ? (
            <>
              <Target size={20} /> NO FUEL AT PLANET
            </>
          ) : (
            <>
              <Send size={20} /> COMMENCE MISSION
            </>
          )}
        </button>
      </div>
    </div>
  );
}
