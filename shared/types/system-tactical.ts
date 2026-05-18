import type { CombatStats } from './combat.js';

export interface SystemTacticalFleetContact {
  id: string;
  systemId: string;
  relation: 'foreign';
  visibility: 'summary';
  status: 'in_flight' | 'returning' | 'stationed';
  ownerAlias: string | null;
  shipTypeId: string | null;
  hp?: number;
  maxHp?: number;
  combatStats?: CombatStats;
  lastCombatTickAt?: string | null;
  point: { x: number; y: number };
  stationedAt: string | null;
}

export interface SystemTacticalStateResponse {
  systemId: string;
  fleetContacts: SystemTacticalFleetContact[];
  updatedAt: string;
}
