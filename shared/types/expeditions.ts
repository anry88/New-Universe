import type { JumpGateJumpResponse } from './jump-gate.js';
import type { ExpeditionRouteMode } from '../config/expeditionRouting.js';

export interface LaunchExpeditionRequest {
  shipId: string;
  routeMode?: ExpeditionRouteMode;
  targetX?: number;
  targetY?: number;
  targetZ?: number;
  /** Known public destination system used when `routeMode` is `jump_gate`. */
  destinationSystemId?: string | null;
  /** Deprecated client hint. Fuel is calculated server-side from distance and ship consumption. */
  fuelLoaded?: number;
  cargoLoaded: number;
  /** Target body for direct survey or colonizer deployment. */
  targetPlanetId?: string | null;
}

export interface ExpeditionResult {
  fuelRequired?: number;
  jumpFuelRequired?: number;
  /** Deprecated legacy field from older launches; new launches use `fuelRequired`. */
  fuelLoaded?: number;
  cargoLoaded?: number;
  distance?: number;
  requestedDistance?: number;
  speed?: number;
  engineFactor?: number;
  routeMode?: ExpeditionRouteMode;
  destinationSystemId?: string | null;
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
