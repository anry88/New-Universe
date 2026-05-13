import type { JumpGateJumpResponse } from './jump-gate.js';

export interface ExpeditionResult {
  fuelRequired?: number;
  /** Deprecated legacy field from older launches; new launches use `fuelRequired`. */
  fuelLoaded?: number;
  cargoLoaded?: number;
  distance?: number;
  requestedDistance?: number;
  speed?: number;
  engineFactor?: number;
  [key: string]: unknown;
}

export interface Expedition {
  id: string;
  shipId: string;
  type: string;
  originPlanetId: string;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetPlanetId: string | null;
  status: string;
  eta: string;
  returnedAt: string | null;
  result: ExpeditionResult;
}

export interface ExpeditionJumpRequest {
  shipId: string;
  mode?: 'random';
  destinationSystemId?: string;
  /**
   * @deprecated Manual sector coordinates are no longer accepted for Jump Gate travel.
   * Use `mode: "random"` for server-authoritative exploration or `destinationSystemId`
   * for a known destination.
   */
  targetSector?: { x: number; y: number; z: number };
}

export interface ExpeditionJumpResponse extends JumpGateJumpResponse {
  deprecated?: boolean;
}
