import React from 'react';
import { ResourceBar } from '../components/ResourceBar';
import { PlanetView } from '../components/PlanetView';
import { BuildQueue } from '../components/BuildQueue';
import { CosmicBottomNav } from '../components/cosmic/atoms';
import { useColonies } from '../hooks/useColonies';
import { useMe } from '../hooks/useMe';

/**
 * Home — the landing screen of the Telegram mini-app.
 *
 * Cosmic Atlas layout:
 *  - Top: live resource bar
 *  - Middle: focal planet with system rail and slot grid (PlanetView)
 *  - Bottom: queue strip + 5-tab nav
 */
interface HomePageProps {
  onOpenTutorial: () => void;
}

export function HomePage({ onOpenTutorial }: HomePageProps) {
  const { data: meData } = useMe();
  const { focalPlanetId } = useColonies();
  return (
    <div className="cosmic-screen" style={{ '--accent': '#5BD7FF' } as React.CSSProperties}>
      {!meData?.tutorialCompletedAt && (
        <div className="tutorial-launcher">
          <button
            type="button"
            onClick={onOpenTutorial}
            className="rounded-md border border-cyan-400/60 bg-slate-900/80 px-3 py-1 text-xs text-cyan-200 hover:bg-slate-800"
          >
            Tutorial
          </button>
        </div>
      )}
      <ResourceBar planetId={focalPlanetId || undefined} />
      <PlanetView />
      <div className="fixed-bottom-ui">
        <BuildQueue planetId={focalPlanetId || undefined} />
        <CosmicBottomNav />
      </div>
    </div>
  );
}
