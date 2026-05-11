import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useMe } from '../hooks/useMe';
import { apiFetch } from '../lib/api';
import { formatHomeSystemTitleForUser } from '../lib/homeSystemTitle';
import { CosmicBackground, CosmicBottomNav } from '../components/cosmic/atoms';
import { useI18n } from '../lib/i18n';
import type { Locale, UpdatePreferredLocaleResponse } from '@shared/types/locale';
import type { User } from '@shared/types/user';

/**
 * ProfilePage — Minimal player profile (Cosmic Atlas P1.1).
 * Displays user identity, location, and basic stats.
 */
export function ProfilePage() {
  const { data: user } = useMe();
  const queryClient = useQueryClient();
  const { locale, setLocale, t } = useI18n();
  const navigate = useNavigate();
  const [isSavingLocale, setIsSavingLocale] = React.useState(false);
  const [localeError, setLocaleError] = React.useState<string | null>(null);

  const homeSystem = user?.homeSystem;
  const sectorTag = homeSystem
    ? `${homeSystem.sectorX}:${homeSystem.sectorY}:${homeSystem.sectorZ}`
    : t('profile.sectorLoading');

  const planetsCount =
    user?.planets?.filter((planet) => planet.isColonized !== false).length ?? 0;

  const updateLocale = async (nextLocale: Locale) => {
    if (nextLocale === locale || isSavingLocale) return;
    setLocale(nextLocale);
    setLocaleError(null);
    setIsSavingLocale(true);

    const previous = queryClient.getQueryData<User>(['me']);
    queryClient.setQueryData<User>(['me'], (old) =>
      old ? { ...old, preferredLocale: nextLocale } : old,
    );

    try {
      await apiFetch<UpdatePreferredLocaleResponse>('/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ preferredLocale: nextLocale }),
      });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      if (previous) queryClient.setQueryData(['me'], previous);
      setLocale(previous?.preferredLocale ?? locale);
      setLocaleError(err instanceof Error ? err.message : t('profile.saveFailed'));
    } finally {
      setIsSavingLocale(false);
    }
  };

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
              {user?.tgUsername?.toUpperCase() || t('profile.commander').toUpperCase()}
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
              <span style={{ color: 'var(--text-dim)', fontSize: '12px', letterSpacing: '0.05em' }}>{t('profile.system').toUpperCase()}</span>
              <span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 500 }}>
                {(user ? formatHomeSystemTitleForUser(user).toUpperCase() : null) || t('profile.initializing').toUpperCase()}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '12px' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '12px', letterSpacing: '0.05em' }}>{t('profile.controlledPlanets').toUpperCase()}</span>
              <span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 500 }}>{planetsCount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '12px' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '12px', letterSpacing: '0.05em' }}>{t('profile.operationalStatus').toUpperCase()}</span>
              <span style={{ color: '#5BD7FF', fontSize: '13px', fontWeight: 500 }}>{t('profile.stable').toUpperCase()}</span>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <span style={{ color: 'var(--text-dim)', fontSize: '12px', letterSpacing: '0.05em' }}>{t('profile.language').toUpperCase()}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['en', 'ru'] as const).map((code) => (
                    <button
                      key={code}
                      type="button"
                      disabled={isSavingLocale}
                      onClick={() => void updateLocale(code)}
                      style={{
                        border: '1px solid rgba(91, 215, 255, 0.35)',
                        background: locale === code ? 'rgba(91, 215, 255, 0.22)' : 'rgba(255, 255, 255, 0.04)',
                        color: locale === code ? 'var(--accent)' : 'var(--text-dim)',
                        padding: '6px 10px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: isSavingLocale ? 'wait' : 'pointer',
                      }}
                    >
                      {code === 'en' ? 'EN' : 'RU'}
                    </button>
                  ))}
                </div>
              </div>
              <p style={{ margin: 0, color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.4 }}>
                {isSavingLocale ? t('profile.saving') : t('profile.languageHelp')}
              </p>
              {localeError && (
                <p style={{ margin: 0, color: '#ff8a8a', fontSize: 11 }} role="alert">
                  {localeError}
                </p>
              )}
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
            {t('profile.return').toUpperCase()}
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
              {t('profile.resumeTutorial').toUpperCase()}
            </button>
          )}
        </div>

        <div style={{ flex: 1 }} />
      </div>

      <CosmicBottomNav />
    </div>
  );
}
