import type { ResearchRequirementRef } from './research.js';

export type JumpGateCalibrationStatus = 'locked' | 'idle' | 'calibrating' | 'ready';
export type JumpGateCalibrationMode = 'random' | 'known';

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
  sector: { x: number; y: number; z: number };
  planetCount: number;
  discoveredAt: string;
}

export interface JumpGateStateResponse {
  unlocked: boolean;
  lockedReason: JumpGateLockedReason | null;
  homeGateAnchor: JumpGateAnchor | null;
  calibration: JumpGateCalibrationState;
  randomJumpAvailability: JumpGateRandomJumpAvailability;
  knownDestinations: JumpGateKnownDestinationSummary[];
}
