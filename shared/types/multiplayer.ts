/** Multiplayer sector map response shapes. */

export type PresenceEntityKind =
  | "neutral_system"
  | "own_home_system"
  | "foreign_colony"
  | "own_colony"
  | "foreign_ship"
  | "own_ship";

export type PresenceEntityType = "home" | "colony" | "fleet" | "public_sector";
export type PresenceEntityRelation = "self" | "foreign" | "public";
export type PresenceVisibility = "full" | "summary";

export interface WorldPosition {
  x: number;
  y: number;
  z: number;
}

export interface PresenceEntityMotion {
  state: "moving";
  dx: number;
  dy: number;
  updatedAt: string;
}

export interface SectorPresenceEntity {
  kind: PresenceEntityKind;
  entityType: PresenceEntityType;
  relation: PresenceEntityRelation;
  systemId: string;
  planetId?: string;
  shipId?: string;
  title: string;
  subtitle?: string;
  visibility: PresenceVisibility;
  worldPosition: WorldPosition;
  motion?: PresenceEntityMotion;
  lastCombatTickAt?: string | null;
}

export interface SectorPresencePayload {
  sector: [number, number, number];
  entities: SectorPresenceEntity[];
}

export type SectorSystemAnchorTag =
  | "home"
  | "discovered"
  | "recent"
  | "colony"
  | "fleet";

export interface SectorSystemAnchor {
  systemId: string;
  title: string;
  sector: [number, number, number];
  worldPosition: WorldPosition;
  tags: SectorSystemAnchorTag[];
  discoveredAt?: string;
  lastActivityAt?: string;
  colonyCount: number;
  shipCount: number;
}

export interface SectorSystemAnchorsPayload {
  systems: SectorSystemAnchor[];
}
