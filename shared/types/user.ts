import type { HomeSystem } from './world.js';
import type { Ship } from './ships.js';
import type { Expedition } from './expeditions.js';

export interface User {
  id: string;
  tgId: string;
  tgUsername: string | null;
  tgFirstName: string | null;
  createdAt: string;
  premiumUntil: string | null;
  powerScore: number;
  homeSystem?: HomeSystem;
  ships?: Ship[];
  expeditions?: Expedition[];
}
