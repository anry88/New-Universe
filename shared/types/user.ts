import type { HomeSystem, Planet } from './world.js';
import type { Ship } from './ships.js';
import type { Expedition } from './expeditions.js';
import type { ResearchProgress } from './research.js';
import type { RushPricing } from './diamonds.js';
import type { Locale } from './locale.js';

export interface User {
  id: string;
  tgId: string;
  tgUsername: string | null;
  tgFirstName: string | null;
  preferredLocale: Locale;
  createdAt: string;
  premiumUntil: string | null;
  powerScore: number;
  /** Premium currency balance (rush builds), account-wide. */
  diamonds: number;
  tutorialStep: number;
  tutorialCompletedAt: string | null;
  homeSystem?: HomeSystem;
  planets?: Planet[];
  ships?: Ship[];
  expeditions?: Expedition[];
  research?: ResearchProgress[];
  rushPricing?: RushPricing;
}
