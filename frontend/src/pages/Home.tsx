import React from 'react';
import { ResourceBar } from '../components/ResourceBar';
import { PlanetView } from '../components/PlanetView';
import { BuildQueue } from '../components/BuildQueue';
import { CosmicBottomNav } from '../components/cosmic/atoms';
import { useMe } from '../hooks/useMe';

/**
 * Home — the landing screen of the Telegram mini-app.
 *
 * Cosmic Atlas layout:
 *  - Top: live resource bar
 *  - Middle: focal planet with system rail and slot grid (PlanetView)
 *  - Bottom: queue strip + 5-tab nav
 */
export function HomePage() {
  const { data: meData } = useMe();
  const focalPlanetId = meData?.homeSystem?.planets?.[0]?.id;
  return (
    <div className="cosmic-screen" style={{ '--accent': '#5BD7FF' } as React.CSSProperties}>
      <ResourceBar planetId={focalPlanetId} />
      <PlanetView />
      <BuildQueue />
      <CosmicBottomNav active="planets" />
    </div>
  );
}
