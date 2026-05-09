/** HTTP GET `/multiplayer/sectors/:sx/:sy/:sz/presence` response shape. */

export type PresenceEntityKind =
  | 'neutral_system'
  | 'own_home_system'
  | 'foreign_colony'
  | 'own_colony'
  | 'foreign_ship'
  | 'own_ship';

export interface WorldPosition {
  x: number;
  y: number;
  z: number;
}

export interface SectorPresenceEntity {
  kind: PresenceEntityKind;
  systemId: string;
  planetId?: string;
  shipId?: string;
  title: string;
  subtitle?: string;
  visibility: 'full' | 'summary';
  worldPosition: WorldPosition;
}

export interface SectorPresencePayload {
  sector: [number, number, number];
  entities: SectorPresenceEntity[];
}
