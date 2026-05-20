import type { ResearchRequirementRef } from './research.js';
import type { PlanetResource } from './world.js';

export type JumpGateCalibrationStatus = 'locked' | 'idle' | 'calibrating' | 'ready';
export type JumpGateCalibrationMode = 'random' | 'known';
export type JumpGateKnownDestinationSource = 'sensor' | 'random_jump';

export type JumpGateLockedReasonCode =
  | 'jump_drive_required'
  | 'home_system_missing';

export type JumpGateAvailabilityBlockedCode =
  | JumpGateLockedReasonCode
  | 'calibration_in_progress'
  | 'random_jump_cooldown';

export interface JumpGateLockedReason {
  code: JumpGateLockedReasonCode;
  requiredResearch?: ResearchRequirementRef;
  currentResearchLevel?: number;
}

export interface JumpGateAnchor {
  systemId: string;
  systemName: string;
  sector: { x: number; y: number; z: number };
  orbitSlot: number;
  orbitRadius: number;
  position: { x: number; y: number; z: number };
}

export interface JumpGateCalibrationState {
  status: JumpGateCalibrationStatus;
  mode: JumpGateCalibrationMode | null;
  targetSystemId: string | null;
  startedAt: string | null;
  completesAt: string | null;
}

export interface JumpGateRandomJumpAvailability {
  available: boolean;
  blockedCode: JumpGateAvailabilityBlockedCode | null;
  readyAt: string | null;
}

export interface JumpGateKnownDestinationSummary {
  systemId: string;
  systemName: string;
  shortTag: string;
  sector: { x: number; y: number; z: number };
  seed: number;
  planetCount: number;
  planets: JumpGateDestinationPlanetSummary[];
  discoveredAt: string;
  source: JumpGateKnownDestinationSource;
  lastVisitedAt: string | null;
}

export interface JumpGateDestinationPlanetSummary {
  id: string;
  systemId: string;
  orbitIndex: number;
  name: string | null;
  biome: string | null;
  size: number | null;
  slotCount: number | null;
  resources?: PlanetResource[];
  isDiscovered: boolean;
  isColonized: boolean;
  isOwnedColony: boolean;
  /** Number of currently standing buildings visible for active colonies. */
  buildingCount?: number;
  /** Most recent surface-combat tick touching one of the planet's standing buildings. */
  lastCombatTickAt?: string | null;
}

export interface JumpGateStateResponse {
  unlocked: boolean;
  lockedReason: JumpGateLockedReason | null;
  homeGateAnchor: JumpGateAnchor | null;
  calibration: JumpGateCalibrationState;
  randomJumpAvailability: JumpGateRandomJumpAvailability;
  knownDestinations: JumpGateKnownDestinationSummary[];
}

export interface JumpGateRandomJumpRequest {
  /** One-use `recon_probe` id used to open a new public destination system. */
  shipId: string;
}

export interface JumpGateKnownDestinationJumpRequest {
  /** Idle ship id for direct travel to an already known destination. */
  shipId: string;
}

export interface JumpGateJumpTargetSystem {
  id: string;
  name: string;
  shortTag: string;
  sector: { x: number; y: number; z: number };
}

export interface JumpGateJumpShipSummary {
  id: string;
  typeId: string;
  status: string;
  fuel: string;
  locationPlanetId: string | null;
}

export interface JumpGateJumpResponse {
  ship: JumpGateJumpShipSummary;
  targetSystem: JumpGateJumpTargetSystem;
  arrivalPlanetId: string;
  destination: JumpGateKnownDestinationSummary;
  /** Jump Fuel reserved from the launch planet inventory. */
  jumpFuelRequired: number;
}

export interface JumpGateRandomJumpResponse {
  ship: JumpGateJumpShipSummary;
  queueItem: {
    id: string;
    completesAt: string;
  };
  /** Jump Fuel reserved from the launch planet inventory. */
  jumpFuelRequired: number;
}
