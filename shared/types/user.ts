import type { HomeSystem, Planet } from './world.js';
import type { Ship } from './ships.js';
import type { Expedition } from './expeditions.js';
import type { ResearchProgress } from './research.js';

export interface User {
  id: string;
  tgId: string;
  tgUsername: string | null;
  tgFirstName: string | null;
  createdAt: string;
  premiumUntil: string | null;
  powerScore: number;
  tutorialStep: number;
  tutorialCompletedAt: string | null;
  /** Premium balance (account-wide); optional until backend exposes it everywhere. */
  diamonds?: number;
  homeSystem?: HomeSystem;
  planets?: Planet[];
  ships?: Ship[];
  expeditions?: Expedition[];
  research?: ResearchProgress[];
}
