import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PLANET_RENAME_DIAMOND_COST } from '@shared/types/entity-rename';
import { useMe } from '../hooks/useMe';
import {
  BIOME_META,
  CosmicBackground,
  PlanetPortrait,
  PlanetRail,
  resolveBiome,
} from './cosmic/atoms';
import { BuildingSlot } from './BuildingSlot';
import { useI18n } from '../lib/i18n';

/**
 * The "current planet" snapshot rendered on the home screen.
 *
 * Picks the first planet from the home system payload as the focal planet,
 * shows the same portrait + rail + slot grid as the dedicated PlanetDetail
 * page, and routes any slot tap into the full editor.
 */
import { useColonies } from '../hooks/useColonies';
import { formatHomeSystemTitleForUser } from '../lib/homeSystemTitle';
import { RenameEntityDialog } from './RenameEntityDialog';

/**
 * The "current planet" snapshot rendered on the home screen.
 *
 * Uses useColonies to get the currently focused planet,
 * shows the same portrait + rail + slot grid as the dedicated PlanetDetail
 * page, and routes any slot tap into the full editor.
 */
export function PlanetView() {
  const { data: meData } = useMe();
  const { focalPlanet: planet, planets: allPlanets, setFocalPlanetId } = useColonies();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [renameOpen, setRenameOpen] = useState(false);

  if (!planet) {
    return (
      <div className="cosmic-scroll" style={{ display: 'grid', placeItems: 'center' }}>
        <p style={{ color: 'var(--text-dim)' }}>{t('planet.loading')}</p>
      </div>
    );
  }

  const biome = resolveBiome(planet.biome);
  const accent = BIOME_META[biome].accent;
  const slotCount = planet.slotCount ?? 0;
  const usedSlots = planet.buildings?.length ?? 0;

  return (
    <div
      style={{ '--accent': accent, position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' } as React.CSSProperties}
    >
      <CosmicBackground accent={accent} starSeed={planet.id.charCodeAt(0) || 7} />
      <div className="cosmic-scroll">
        <PlanetPortrait
          biome={biome}
          name={planet.name}
          size={planet.size}
          slots={slotCount}
          slotsUsed={usedSlots}
          onNameClick={() => setRenameOpen(true)}
          nameClickAriaLabel={t('rename.planet.title')}
        />

        <div className="rail-wrap">
          <div className="rail-label">
            {(meData ? formatHomeSystemTitleForUser(meData) : t('planet.homeSystem')).toUpperCase()}
          </div>
          <PlanetRail
            planets={allPlanets.map((p) => ({ id: p.id, name: p.name, biome: p.biome }))}
            current={planet.id}
            onSelect={(id) => setFocalPlanetId(id)}
          />
        </div>

        <div className="slots-section">
          <div className="section-head">
            <div className="section-title">{t('build.installations').toUpperCase()}</div>
            <div className="section-count">
              {usedSlots}/{slotCount} {t('common.slots')}
            </div>
          </div>
          <div className="slots-grid">
            {Array.from({ length: slotCount }, (_, i) => {
              const building = planet.buildings?.find((b) => b.slotIndex === i);
              return (
                <BuildingSlot
                  key={i}
                  index={i}
                  building={building}
                  onClick={() => navigate(`/planet/${planet.id}?slot=${i}`)}
                  biomeAccent={accent}
                />
              );
            })}
          </div>
        </div>
      </div>

      {renameOpen && (
        <RenameEntityDialog
          kind="planet"
          targetId={planet.id}
          currentName={planet.name}
          renameCount={planet.renameCount ?? 0}
          diamondBalance={meData?.diamonds ?? 0}
          paidCost={PLANET_RENAME_DIAMOND_COST}
          onClose={() => setRenameOpen(false)}
        />
      )}
    </div>
  );
}
