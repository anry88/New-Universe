import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { useMe } from '../hooks/useMe';
import { apiFetch } from '../lib/api';
import { CosmicBottomNav } from '../components/cosmic/atoms';
import { SectorRenderer } from '../components/pixi/SectorRenderer';
import type { SectorPresencePayload } from '@shared/types/multiplayer';

function parseCoord(raw: string | null, fallback: number): number {
  if (raw === null || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Sector-scale multiplayer map — shows anonymized foreign markers and local assets
 * for one sector cube via `GET /multiplayer/sectors/:sx/:sy/:sz/presence`.
 */
export function SectorMapPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: meData, isLoading } = useMe();

  const home = meData?.homeSystem;

  const sector = useMemo(() => {
    const h = meData?.homeSystem;
    return {
      sx: parseCoord(searchParams.get('sx'), h?.sectorX ?? 0),
      sy: parseCoord(searchParams.get('sy'), h?.sectorY ?? 0),
      sz: parseCoord(searchParams.get('sz'), h?.sectorZ ?? 0),
    };
  }, [searchParams, meData?.homeSystem]);

  const [draftSx, setDraftSx] = useState(sector.sx);
  const [draftSy, setDraftSy] = useState(sector.sy);
  const [draftSz, setDraftSz] = useState(sector.sz);

  useEffect(() => {
    setDraftSx(sector.sx);
    setDraftSy(sector.sy);
    setDraftSz(sector.sz);
  }, [sector.sx, sector.sy, sector.sz]);

  const { data, isFetching, error } = useQuery({
    queryKey: ['sector-presence', sector.sx, sector.sy, sector.sz],
    queryFn: () =>
      apiFetch<SectorPresencePayload>(
        `/multiplayer/sectors/${sector.sx}/${sector.sy}/${sector.sz}/presence`,
      ),
    enabled: Boolean(meData?.id && home),
  });

  const applySector = () => {
    setSearchParams({ sx: String(draftSx), sy: String(draftSy), sz: String(draftSz) });
  };

  if (isLoading) {
    return (
      <div className="cosmic-screen" style={{ '--accent': '#5BD7FF', display: 'grid', placeItems: 'center' } as React.CSSProperties}>
        <div className="qstrip-bar" style={{ width: 80 }}>
          <div className="qstrip-fill" style={{ width: '60%' }} />
        </div>
      </div>
    );
  }

  if (!home) {
    return (
      <div className="cosmic-screen" style={{ '--accent': '#5BD7FF', display: 'grid', placeItems: 'center' } as React.CSSProperties}>
        <p style={{ color: 'var(--text-dim)' }}>No home system — cannot anchor sector map.</p>
        <button type="button" className="cosmic-cta" style={{ marginTop: 12 }} onClick={() => navigate('/')}>
          Home
        </button>
      </div>
    );
  }

  return (
    <div
      className="cosmic-screen"
      style={
        {
          '--accent': '#5BD7FF',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        } as React.CSSProperties
      }
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate('/map')}
          style={{
            padding: 8,
            borderRadius: 999,
            background: 'rgba(14,20,36,0.85)',
            border: '1px solid var(--line)',
            backdropFilter: 'blur(8px)',
            color: 'var(--text)',
            pointerEvents: 'auto',
          }}
        >
          <ChevronLeft size={20} />
        </button>

        <div
          style={{
            flex: 1,
            background: 'rgba(14,20,36,0.85)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: '10px 12px',
            backdropFilter: 'blur(8px)',
            pointerEvents: 'auto',
          }}
        >
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
            Sector map
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>
            Multiplayer radar · summary visibility for foreign actors
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            <label style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              sx
              <input
                type="number"
                value={draftSx}
                onChange={(e) => setDraftSx(Number.parseInt(e.target.value, 10) || 0)}
                style={{
                  marginLeft: 4,
                  width: 56,
                  borderRadius: 6,
                  border: '1px solid var(--line)',
                  background: 'rgba(8,12,22,0.9)',
                  color: 'var(--text)',
                  fontSize: 11,
                  padding: '4px 6px',
                }}
              />
            </label>
            <label style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              sy
              <input
                type="number"
                value={draftSy}
                onChange={(e) => setDraftSy(Number.parseInt(e.target.value, 10) || 0)}
                style={{
                  marginLeft: 4,
                  width: 56,
                  borderRadius: 6,
                  border: '1px solid var(--line)',
                  background: 'rgba(8,12,22,0.9)',
                  color: 'var(--text)',
                  fontSize: 11,
                  padding: '4px 6px',
                }}
              />
            </label>
            <label style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              sz
              <input
                type="number"
                value={draftSz}
                onChange={(e) => setDraftSz(Number.parseInt(e.target.value, 10) || 0)}
                style={{
                  marginLeft: 4,
                  width: 56,
                  borderRadius: 6,
                  border: '1px solid var(--line)',
                  background: 'rgba(8,12,22,0.9)',
                  color: 'var(--text)',
                  fontSize: 11,
                  padding: '4px 6px',
                }}
              />
            </label>
            <button
              type="button"
              onClick={applySector}
              style={{
                alignSelf: 'flex-end',
                borderRadius: 8,
                border: '1px solid var(--line)',
                background: 'rgba(91,215,255,0.12)',
                color: 'var(--accent)',
                fontSize: 11,
                padding: '6px 10px',
              }}
            >
              Go
            </button>
          </div>
        </div>

        <div style={{ width: 40 }} />
      </div>

      <div
        style={{
          flex: '1 1 auto',
          position: 'relative',
          minHeight: 0,
          width: '100%',
          height: 'calc(100vh - 64px)',
          paddingTop: 152,
          boxSizing: 'border-box',
        }}
      >
        {error && (
          <div style={{ padding: '0 16px', color: '#f87171', fontSize: 13 }}>
            {(error as Error).message}
          </div>
        )}
        {isFetching && (
          <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-dim)' }}>Scanning sector…</div>
        )}
        <SectorRenderer entities={data?.entities ?? []} />
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 88,
          left: '50%',
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
          maxWidth: '92%',
        }}
      >
        <div
          style={{
            background: 'rgba(8,12,22,0.85)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: '8px 14px',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)' }}>
            CYAN HOME · GREEN COLONY · ORANGE FOREIGN · BLUE FRIENDLY SHIP
          </span>
        </div>
      </div>

      <CosmicBottomNav active="map" />
    </div>
  );
}
