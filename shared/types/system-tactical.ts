import type { CombatStats } from "./combat.js";

export interface SystemTacticalFleetMotion {
  state: "moving";
  dx: number;
  dy: number;
  updatedAt: string;
}

export interface SystemTacticalFleetContact {
  id: string;
  systemId: string;
  relation: "self" | "foreign";
  visibility: "full" | "summary";
  status: "in_flight" | "returning" | "stationed";
  ownerAlias: string | null;
  shipTypeId: string | null;
  hp?: number;
  maxHp?: number;
  combatStats?: CombatStats;
  lastCombatTickAt?: string | null;
  point: { x: number; y: number };
  motion?: SystemTacticalFleetMotion | null;
  stationedAt: string | null;
}

export interface SystemTacticalStateResponse {
  systemId: string;
  fleetContacts: SystemTacticalFleetContact[];
  updatedAt: string;
}
