import type { HomeSystem, Planet } from './world.js';
import type { Ship } from './ships.js';
import type { Expedition } from './expeditions.js';
import type { ResearchProgress } from './research.js';
import type { RushPricing } from './diamonds.js';
import type { Locale } from './locale.js';
import type { NotificationPreferences } from './notifications.js';

export interface ColonizationSummary {
  currentColonies: number;
  maxColonies: number;
  logisticsLevel: number;
  maxColoniesBase: number;
  maxColoniesPerLogisticsLevel: number;
  cooldownSec: number;
  cooldownRemainingSec: number;
}

export interface User {
  id: string;
  tgId: string;
  tgUsername: string | null;
  tgFirstName: string | null;
  preferredLocale: Locale;
  notificationPreferences: NotificationPreferences;
  telegramNotificationsBlockedAt: string | null;
  createdAt: string;
  premiumUntil: string | null;
  powerScore: number;
  /** Premium currency balance (rush builds), account-wide. */
  diamonds: number;
  tutorialStep: number;
  tutorialCompletedAt: string | null;
  /** Bitmask of claimed onboarding rewards for tutorial steps 0..4. */
  tutorialRewardsClaimed: number;
  homeSystem?: HomeSystem;
  planets?: Planet[];
  ships?: Ship[];
  expeditions?: Expedition[];
  research?: ResearchProgress[];
  colonization?: ColonizationSummary;
  rushPricing?: RushPricing;
}
