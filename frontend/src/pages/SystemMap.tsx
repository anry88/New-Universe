import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe } from '../hooks/useMe';
import { CosmicSystemRenderer } from '../components/cosmic/SystemMap';
import { CosmicBottomNav } from '../components/cosmic/atoms';
import { ChevronLeft } from 'lucide-react';

/**
 * Galaxy / system map — Cosmic Atlas chrome around the existing PixiJS
 * renderer. The renderer keeps owning the pan/zoom and orbit visuals; this
 * file just supplies the page header, legend strip, and bottom nav so the
 * screen reads as part of the same product as PlanetDetail / Home.
 */
export function SystemMapPage() {
  const { data: meData, isLoading } = useMe();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="cosmic-screen" style={{ '--accent': '#5BD7FF', display: 'grid', placeItems: 'center' } as React.CSSProperties}>
        <div className="qstrip-bar" style={{ width: 80 }}>
          <div className="qstrip-fill" style={{ width: '60%' }} />
        </div>
      </div>
    );
  }

  if (!meData?.homeSystem) {
    return (
      <div className="cosmic-screen" style={{ '--accent': '#5BD7FF', display: 'grid', placeItems: 'center' } as React.CSSProperties}>
        <div style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
          <p style={{ marginBottom: 16 }}>No home system found.</p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="cosmic-cta"
            style={{ padding: '8px 14px' }}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cosmic-screen" style={{ '--accent': '#5BD7FF', position: 'relative' } as React.CSSProperties}>
      {/* Header overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pointerEvents: 'none',
        }}
      >
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate('/')}
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
            background: 'rgba(14,20,36,0.85)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: '8px 14px',
            backdropFilter: 'blur(8px)',
            pointerEvents: 'auto',
            textAlign: 'center',
          }}
        >
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
            {meData.homeSystem.name}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: '0.18em',
              color: 'var(--text-faint)',
              marginTop: 2,
            }}
          >
            SECTOR {meData.homeSystem.sectorX}:{meData.homeSystem.sectorY}:{meData.homeSystem.sectorZ}
          </div>
        </div>

        <div style={{ width: 40 }} />
      </div>

      {/* SVG/HTML system renderer — uses real biome sprites and a sun.
          The wrapper has explicit positioning so the renderer (which uses
          `position: absolute; inset: 0`) gets a deterministic frame even
          when the parent flex container measures awkwardly. */}
      <div
        style={{
          flex: '1 1 auto',
          position: 'relative',
          minHeight: 0,
          width: '100%',
          // Reserve space for the bottom nav (~64px) so the renderer doesn't
          // hide behind it on short viewports.
          height: 'calc(100vh - 64px)',
        }}
      >
        <CosmicSystemRenderer
          system={meData.homeSystem}
          ships={meData.ships || []}
          expeditions={meData.expeditions || []}
          onPlanetClick={(planet) => navigate(`/planet/${planet.id}`)}
        />
      </div>

      {/* Footer hint */}
      <div
        style={{
          position: 'absolute',
          bottom: 88,
          left: '50%',
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            background: 'rgba(8,12,22,0.85)',
            border: '1px solid var(--line)',
            borderRadius: 999,
            padding: '6px 14px',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: '0.18em',
              color: 'var(--text-dim)',
            }}
          >
            DRAG TO PAN · PINCH TO ZOOM · TAP PLANETS
          </span>
        </div>
      </div>

      <CosmicBottomNav active="map" />
    </div>
  );
}
