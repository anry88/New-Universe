import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe } from '../hooks/useMe';
import { CosmicBackground, CosmicBottomNav } from '../components/cosmic/atoms';

/**
 * ProfilePage — Minimal player profile (Cosmic Atlas P1.1).
 * Displays user identity, location, and basic stats.
 */
export function ProfilePage() {
  const { data: user } = useMe();
  const navigate = useNavigate();

  const homeSystem = user?.homeSystem;
  const sectorTag = homeSystem
    ? `${homeSystem.sectorX}:${homeSystem.sectorY}:${homeSystem.sectorZ}`
    : 'Sector Data Initializing...';

  const planetsCount = homeSystem?.planets?.length ?? 0;

  return (
    <div className="cosmic-screen" style={{ '--accent': '#5BD7FF' } as React.CSSProperties}>
      <CosmicBackground accent="#5BD7FF" />

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginTop: '40px' }}>
          {/* Avatar Placeholder: Monospace initial in a glowing circle */}
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'rgba(91, 215, 255, 0.1)',
            border: '1px solid var(--accent)',
            display: 'grid',
            placeItems: 'center',
            fontSize: '32px',
            fontWeight: 'bold',
            color: 'var(--accent)',
            boxShadow: '0 0 20px rgba(91, 215, 255, 0.2)',
            fontFamily: 'monospace'
          }}>
            {user?.tgUsername?.charAt(0).toUpperCase() || 'U'}
          </div>

          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '24px', margin: 0, color: 'var(--text)', fontWeight: 600 }}>
              {user?.tgUsername?.toUpperCase() || 'COMMANDER'}
            </h1>
            <p style={{ color: 'var(--accent)', fontSize: '11px', margin: '6px 0 0 0', letterSpacing: '0.1em', opacity: 0.8 }}>
              {sectorTag}
            </p>
          </div>
        </div>

        <div className="cosmic-scroll" style={{ marginTop: '32px' }}>
          <div style={{
            background: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '12px' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '12px', letterSpacing: '0.05em' }}>SYSTEM</span>
              <span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 500 }}>{homeSystem?.name?.toUpperCase() || 'INITIALIZING...'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '12px' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '12px', letterSpacing: '0.05em' }}>CONTROLLED PLANETS</span>
              <span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 500 }}>{planetsCount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '12px', letterSpacing: '0.05em' }}>OPERATIONAL STATUS</span>
              <span style={{ color: '#5BD7FF', fontSize: '13px', fontWeight: 500 }}>STABLE</span>
            </div>
          </div>

          <button
            type="button"
            className="cosmic-button"
            style={{ 
              marginTop: '32px', 
              width: '100%', 
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'var(--text)',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
            onClick={() => navigate('/')}
          >
            RETURN TO COMMAND
          </button>

          {!user?.tutorialCompletedAt && (
            <button
              type="button"
              className="cosmic-button"
              style={{
                marginTop: '12px',
                width: '100%',
                background: 'rgba(91, 215, 255, 0.12)',
                border: '1px solid rgba(91, 215, 255, 0.45)',
                color: 'var(--accent)',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              onClick={() => navigate('/onboarding')}
            >
              RESUME TUTORIAL
            </button>
          )}
        </div>

        <div style={{ flex: 1 }} />
      </div>

      <CosmicBottomNav />
    </div>
  );
}
