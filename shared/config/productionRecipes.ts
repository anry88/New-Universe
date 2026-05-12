import type { ResourceId } from '../types/research.js';

export interface ProductionRecipe {
  id: string;
  buildingTypeId: string;
  name: { ru: string; en: string };
  description: { ru: string; en: string };
  /** Output units produced when `quantity` is 1. */
  output: { resourceId: ResourceId; amount: number };
  /** Input units consumed when `quantity` is 1 before server-side modifiers. */
  inputs: { resourceId: ResourceId; amount: number }[];
  /** Base seconds for `quantity` 1 before server-side modifiers. */
  baseDurationSec: number;
}

export const PRODUCTION_RECIPES: ProductionRecipe[] = [
  {
    id: 'steel_from_iron_water',
    buildingTypeId: 'smelter',
    name: { ru: 'Сталь из железа', en: 'Steel from Iron' },
    description: {
      ru: 'Переплавляет железо в сталь с водяным охлаждением.',
      en: 'Smelts iron into steel with water cooling.',
    },
    output: { resourceId: 'steel', amount: 1 },
    inputs: [
      { resourceId: 'iron', amount: 2 },
      { resourceId: 'water', amount: 0.2 },
    ],
    baseDurationSec: 12,
  },
  {
    id: 'electronics_standard',
    buildingTypeId: 'fabrication_bay',
    name: { ru: 'Электроника', en: 'Electronics' },
    description: {
      ru: 'Собирает электронику из кремния, меди, стали и карбида кремния.',
      en: 'Assembles electronics from silicon, copper, steel and silicon carbide.',
    },
    output: { resourceId: 'electronics', amount: 1 },
    inputs: [
      { resourceId: 'silicon', amount: 2 },
      { resourceId: 'copper', amount: 1 },
      { resourceId: 'steel', amount: 0.5 },
      { resourceId: 'silicon_carbide', amount: 0.1 },
    ],
    baseDurationSec: 24,
  },
  {
    id: 'water_from_ice',
    buildingTypeId: 'cryo_factory',
    name: { ru: 'Растопить лёд', en: 'Melt Ice' },
    description: {
      ru: 'Превращает лёд в воду без потерь.',
      en: 'Converts ice into water without loss.',
    },
    output: { resourceId: 'water', amount: 1 },
    inputs: [{ resourceId: 'ice', amount: 1 }],
    baseDurationSec: 8,
  },
  {
    id: 'ice_from_water',
    buildingTypeId: 'cryo_factory',
    name: { ru: 'Заморозить воду', en: 'Freeze Water' },
    description: {
      ru: 'Производит лёд из воды с криогенными потерями.',
      en: 'Produces ice from water with cryogenic loss.',
    },
    output: { resourceId: 'ice', amount: 1 },
    inputs: [{ resourceId: 'water', amount: 1.06 }],
    baseDurationSec: 10,
  },
  {
    id: 'fuel_from_oil',
    buildingTypeId: 'refinery',
    name: { ru: 'Топливо из нефти', en: 'Fuel from Oil' },
    description: {
      ru: 'Перерабатывает нефть в корабельное топливо.',
      en: 'Refines oil into ship fuel.',
    },
    output: { resourceId: 'fuel', amount: 1 },
    inputs: [
      { resourceId: 'oil', amount: 1.2 },
      { resourceId: 'water', amount: 0.1 },
    ],
    baseDurationSec: 10,
  },
  {
    id: 'fuel_from_methane',
    buildingTypeId: 'refinery',
    name: { ru: 'Топливо из метана', en: 'Fuel from Methane' },
    description: {
      ru: 'Синтезирует топливо из метана; метана требуется больше, чем нефти.',
      en: 'Synthesizes fuel from methane; requires more feedstock than oil.',
    },
    output: { resourceId: 'fuel', amount: 1 },
    inputs: [
      { resourceId: 'methane', amount: 3.5 },
      { resourceId: 'water', amount: 0.2 },
      { resourceId: 'sulfur', amount: 0.05 },
    ],
    baseDurationSec: 14,
  },
];

export function recipesForBuildingType(buildingTypeId: string): ProductionRecipe[] {
  return PRODUCTION_RECIPES.filter((recipe) => recipe.buildingTypeId === buildingTypeId);
}

export function findProductionRecipe(recipeId: string): ProductionRecipe | undefined {
  return PRODUCTION_RECIPES.find((recipe) => recipe.id === recipeId);
}
