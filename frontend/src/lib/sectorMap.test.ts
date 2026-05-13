import { describe, expect, it } from 'vitest';
import type { SectorPresenceEntity } from '@shared/types/multiplayer';
import {
  isUnknownSectorEntity,
  sectorEntityDisplay,
  summarizeSectorEntities,
} from './sectorMap';

const t = (key: string, params?: Record<string, string | number>) => {
  const dictionary: Record<string, string> = {
    'sector.entity.foreignSource': 'Masked source: {source}',
    'sector.entity.foreignSourceUnknown': 'Masked source hidden',
    'sector.entity.unknownColony': 'Unknown colony',
    'sector.entity.unknownContact': 'Unknown contact',
    'sector.entity.unknownFleet': 'Unknown fleet',
    'sector.relation.foreign': 'Foreign',
    'sector.relation.public': 'Neutral',
    'sector.relation.self': 'Local',
    'sector.type.colony': 'Colony',
    'sector.type.fleet': 'Fleet',
    'sector.type.home': 'Home',
    'sector.type.public_sector': 'System',
    'sector.visibility.full': 'Full',
    'sector.visibility.fullNote': 'Full details available',
    'sector.visibility.publicNote': 'Public system signature only',
    'sector.visibility.summary': 'Summary',
    'sector.visibility.summaryNote': 'Hidden details redacted',
  };

  const template = dictionary[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, param: string) => String(params?.[param] ?? ''));
};

function entity(input: Partial<SectorPresenceEntity>): SectorPresenceEntity {
  return {
    kind: 'neutral_system',
    entityType: 'public_sector',
    relation: 'public',
    systemId: 'system-1',
    title: 'Open Nexus',
    visibility: 'summary',
    worldPosition: { x: 10, y: 20, z: 30 },
    ...input,
  };
}

describe('sector map UI helpers', () => {
  it('counts local, neutral, foreign, and hidden-summary contacts', () => {
    const summary = summarizeSectorEntities([
      entity({ relation: 'self', entityType: 'home', visibility: 'full' }),
      entity({ relation: 'public', entityType: 'public_sector', visibility: 'summary' }),
      entity({ relation: 'foreign', entityType: 'colony', visibility: 'summary' }),
      entity({ relation: 'foreign', entityType: 'fleet', visibility: 'summary' }),
    ]);

    expect(summary.total).toBe(4);
    expect(summary.relation.self).toBe(1);
    expect(summary.relation.public).toBe(1);
    expect(summary.relation.foreign).toBe(2);
    expect(summary.type.fleet).toBe(1);
    expect(summary.hiddenSummary).toBe(2);
  });

  it('redacts backend titles for unknown foreign summary contacts', () => {
    const foreignFleet = entity({
      kind: 'foreign_ship',
      entityType: 'fleet',
      relation: 'foreign',
      shipId: 'ship-secret-id',
      title: 'Ship · stealth_scout',
      subtitle: '@rival',
      visibility: 'summary',
    });

    const display = sectorEntityDisplay(foreignFleet, t);

    expect(isUnknownSectorEntity(foreignFleet)).toBe(true);
    expect(display.title).toBe('Unknown fleet');
    expect(display.subtitle).toBe('Masked source: @rival');
    expect(display.title).not.toContain('stealth_scout');
    expect(display.title).not.toContain('ship-secret-id');
    expect(display.privacyNote).toBe('Hidden details redacted');
  });

  it('keeps full local contact titles visible', () => {
    const ownColony = entity({
      kind: 'own_colony',
      entityType: 'colony',
      relation: 'self',
      planetId: 'planet-owned-id',
      title: 'Settlement Prime',
      visibility: 'full',
    });

    const display = sectorEntityDisplay(ownColony, t);

    expect(isUnknownSectorEntity(ownColony)).toBe(false);
    expect(display.title).toBe('Settlement Prime');
    expect(display.visibilityLabel).toBe('Full');
    expect(display.privacyNote).toBe('Full details available');
  });
});
