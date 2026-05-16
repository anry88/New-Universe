export const TELEGRAM_STARS_CURRENCY = 'XTR' as const;

export type StarsDiamondPackId =
  | 'diamonds_100'
  | 'diamonds_500'
  | 'diamonds_2500'
  | 'diamonds_5000'
  | 'diamonds_10000';

export interface StarsDiamondPack {
  id: StarsDiamondPackId;
  diamonds: number;
  priceStars: number;
  bonusPercentVsPrevious: number;
}

export const STARS_DIAMOND_PACKS = [
  { id: 'diamonds_100', diamonds: 100, priceStars: 20, bonusPercentVsPrevious: 0 },
  { id: 'diamonds_500', diamonds: 500, priceStars: 85, bonusPercentVsPrevious: 18 },
  { id: 'diamonds_2500', diamonds: 2500, priceStars: 350, bonusPercentVsPrevious: 21 },
  { id: 'diamonds_5000', diamonds: 5000, priceStars: 600, bonusPercentVsPrevious: 17 },
  { id: 'diamonds_10000', diamonds: 10000, priceStars: 1000, bonusPercentVsPrevious: 20 },
] as const satisfies readonly StarsDiamondPack[];

export function findStarsDiamondPack(packId: string): StarsDiamondPack | null {
  return STARS_DIAMOND_PACKS.find((pack) => pack.id === packId) ?? null;
}
