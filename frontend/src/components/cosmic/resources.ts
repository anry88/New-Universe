/**
 * Resource symbol mapping used by the Cosmic Atlas resource chip.
 * Falls back to the resource id (uppercased) for unknown ids.
 */
import type { Locale } from '@shared/types/locale';

interface ResourceMeta {
  symbol: string;
  full?: Record<Locale, string>;
}

const RESOURCE_META: Record<string, ResourceMeta> = {
  water: { symbol: 'H₂O', full: { en: 'Water', ru: 'Вода' } },
  iron: { symbol: 'Fe', full: { en: 'Iron', ru: 'Железо' } },
  silicon: { symbol: 'Si', full: { en: 'Silicon', ru: 'Кремний' } },
  methane: { symbol: 'CH₄', full: { en: 'Methane', ru: 'Метан' } },
  tritium: { symbol: 'T₂', full: { en: 'Tritium', ru: 'Тритий' } },
  fuel: { symbol: 'Fuel', full: { en: 'Fuel', ru: 'Топливо' } },
  jump_fuel: { symbol: 'JF', full: { en: 'Jump Fuel', ru: 'Прыжковое топливо' } },
  carbon: { symbol: 'C', full: { en: 'Carbon', ru: 'Углерод' } },
  copper: { symbol: 'Cu', full: { en: 'Copper', ru: 'Медь' } },
  aluminum: { symbol: 'Al', full: { en: 'Aluminum', ru: 'Алюминий' } },
  titanium: { symbol: 'Ti', full: { en: 'Titanium', ru: 'Титан' } },
  ice: { symbol: 'H₂O*', full: { en: 'Ice', ru: 'Лед' } },
  oil: { symbol: 'Oil', full: { en: 'Oil', ru: 'Нефть' } },
  sulfur: { symbol: 'S', full: { en: 'Sulfur', ru: 'Сера' } },
  mercury: { symbol: 'Hg', full: { en: 'Mercury', ru: 'Ртуть' } },
  magnesium: { symbol: 'Mg', full: { en: 'Magnesium', ru: 'Магний' } },
  lead: { symbol: 'Pb', full: { en: 'Lead', ru: 'Свинец' } },
  uranium: { symbol: 'U', full: { en: 'Uranium', ru: 'Уран' } },
  cobalt: { symbol: 'Co', full: { en: 'Cobalt', ru: 'Кобальт' } },
  silicon_carbide: { symbol: 'SiC', full: { en: 'Silicon Carbide', ru: 'Карбид кремния' } },
  antimatter: { symbol: 'Am', full: { en: 'Antimatter', ru: 'Антиматерия' } },
  dark_matter: { symbol: 'Dm', full: { en: 'Dark Matter', ru: 'Темная материя' } },
  iridium: { symbol: 'Ir', full: { en: 'Iridium', ru: 'Иридий' } },
  biomass: { symbol: 'Bio', full: { en: 'Biomass', ru: 'Биомасса' } },
  steel: { symbol: 'St', full: { en: 'Steel', ru: 'Сталь' } },
  electronics: { symbol: 'EC', full: { en: 'Electronics', ru: 'Электроника' } },
  energy: { symbol: '⚡', full: { en: 'Energy', ru: 'Энергия' } },
};

export function getResourceSymbol(resourceId: string): string {
  const meta = RESOURCE_META[resourceId.toLowerCase()];
  if (meta) return meta.symbol;
  // Fallback: uppercase first 3 chars, or full id if shorter.
  return resourceId.length > 3
    ? resourceId.slice(0, 3).toUpperCase()
    : resourceId.toUpperCase();
}

export function getResourceLabel(resourceId: string, locale: Locale = 'en'): string {
  return RESOURCE_META[resourceId.toLowerCase()]?.full?.[locale] ?? resourceId;
}

/**
 * Calculates fresh resource amount based on regen rate per hour.
 * Acceptance criteria: regenRate is divided by 3600 for per-second increment.
 */
export function calculateRegen(
  currentAmount: number,
  regenRatePerHour: number,
  deltaSeconds: number,
  storageCap: number
): number {
  const regenRatePerSecond = regenRatePerHour / 3600;
  return Math.min(currentAmount + regenRatePerSecond * deltaSeconds, storageCap);
}
