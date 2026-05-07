export type BiomeType = 'rocky' | 'ocean' | 'gas_giant' | 'ice' | 'volcanic' | 'green' | 'anomaly';

export interface Biome {
  id: BiomeType;
  name: { ru: string; en: string };
  commonResources: string[];
  rareResources: string[];
  bonuses: string[];
  penalties: string[];
}

export const BIOMES: Record<BiomeType, Biome> = {
  rocky: {
    id: 'rocky',
    name: { ru: 'Каменистая', en: 'Rocky' },
    commonResources: ['iron', 'copper', 'silicon'],
    rareResources: ['water'],
    bonuses: ['cheap_mines'],
    penalties: ['slow_factories'],
  },
  ocean: {
    id: 'ocean',
    name: { ru: 'Океаническая', en: 'Ocean' },
    commonResources: ['water', 'ice', 'biomass'],
    rareResources: ['iron'],
    bonuses: ['free_cooling'],
    penalties: ['slow_build'],
  },
  gas_giant: {
    id: 'gas_giant',
    name: { ru: 'Газовый гигант', en: 'Gas Giant' },
    commonResources: ['methane'],
    rareResources: [],
    bonuses: ['infinite_gas'],
    penalties: ['no_factories'],
  },
  ice: {
    id: 'ice',
    name: { ru: 'Ледяная', en: 'Ice' },
    commonResources: ['ice', 'magnesium', 'mercury'],
    rareResources: ['biomass'],
    bonuses: ['storage_plus_10'],
    penalties: ['low_energy'],
  },
  volcanic: {
    id: 'volcanic',
    name: { ru: 'Вулканическая', en: 'Volcanic' },
    commonResources: ['sulfur', 'iron', 'copper', 'uranium'],
    rareResources: ['water'],
    bonuses: ['rare_alloys_chance'],
    penalties: ['eruptions'],
  },
  green: {
    id: 'green',
    name: { ru: 'Зелёная', en: 'Green' },
    commonResources: ['biomass', 'silicon', 'water'],
    rareResources: ['iron'],
    bonuses: ['fast_build'],
    penalties: ['expensive_colonization'],
  },
  anomaly: {
    id: 'anomaly',
    name: { ru: 'Аномалия', en: 'Anomaly' },
    commonResources: ['antimatter', 'dark_matter'],
    rareResources: [],
    bonuses: ['unique_resources'],
    penalties: ['no_colonization'],
  },
};
