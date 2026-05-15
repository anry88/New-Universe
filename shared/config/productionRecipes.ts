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
    id: 'silicon_carbide_from_silicon_carbon',
    buildingTypeId: 'fabrication_bay',
    name: { ru: 'Карбид кремния', en: 'Silicon Carbide' },
    description: {
      ru: 'Дорогой высокотемпературный цикл из кремния, углерода и стали для прочных композитов.',
      en: 'Runs an expensive high-temperature silicon, carbon, and steel cycle for durable composites.',
    },
    output: { resourceId: 'silicon_carbide', amount: 1 },
    inputs: [
      { resourceId: 'silicon', amount: 24 },
      { resourceId: 'carbon', amount: 16 },
      { resourceId: 'steel', amount: 2 },
    ],
    baseDurationSec: 180,
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
  {
    id: 'jump_fuel_from_ice_tritium',
    buildingTypeId: 'refinery',
    name: { ru: 'Прыжковое топливо', en: 'Jump Fuel' },
    description: {
      ru: 'Стабилизирует тритий льдом и серным катализатором в том же НПЗ, где производится обычное топливо.',
      en: 'Stabilizes tritium with ice and a sulfur catalyst in the same refinery used for ordinary fuel.',
    },
    output: { resourceId: 'jump_fuel', amount: 1 },
    inputs: [
      { resourceId: 'ice', amount: 3 },
      { resourceId: 'tritium', amount: 0.05 },
      { resourceId: 'sulfur', amount: 0.2 },
    ],
    baseDurationSec: 18,
  },
  {
    id: 'energy_from_fuel',
    buildingTypeId: 'fuel_generator',
    name: { ru: 'Заряд от топлива', en: 'Charge from Fuel' },
    description: {
      ru: 'Сжигает готовое топливо для быстрой зарядки аккумуляторов.',
      en: 'Burns refined fuel for a fast battery charge.',
    },
    output: { resourceId: 'energy', amount: 90 },
    inputs: [{ resourceId: 'fuel', amount: 1 }],
    baseDurationSec: 20,
  },
  {
    id: 'energy_from_oil',
    buildingTypeId: 'fuel_generator',
    name: { ru: 'Заряд от нефти', en: 'Charge from Oil' },
    description: {
      ru: 'Сжигает нефть напрямую: дешевле по инфраструктуре, но менее эффективно, чем готовое топливо.',
      en: 'Burns oil directly: simpler infrastructure, but less efficient than refined fuel.',
    },
    output: { resourceId: 'energy', amount: 62 },
    inputs: [{ resourceId: 'oil', amount: 1 }],
    baseDurationSec: 28,
  },
  {
    id: 'energy_from_methane',
    buildingTypeId: 'fuel_generator',
    name: { ru: 'Заряд от метана', en: 'Charge from Methane' },
    description: {
      ru: 'Сжигает метан с низкой энергоотдачей, но использует распространенные газовые залежи.',
      en: 'Burns methane with lower yield, using common gas deposits.',
    },
    output: { resourceId: 'energy', amount: 34 },
    inputs: [{ resourceId: 'methane', amount: 2 }],
    baseDurationSec: 32,
  },
  {
    id: 'energy_from_uranium_cell',
    buildingTypeId: 'atomic_reactor',
    name: { ru: 'Атомный энергоблок', en: 'Atomic Power Cell' },
    description: {
      ru: 'Абстрактный закрытый энергоблок для долгой зарядки аккумуляторов редкими материалами.',
      en: 'Abstract sealed power cell for long battery charging with rare materials.',
    },
    output: { resourceId: 'energy', amount: 900 },
    inputs: [
      { resourceId: 'uranium', amount: 0.4 },
      { resourceId: 'lead', amount: 1.5 },
      { resourceId: 'water', amount: 2 },
    ],
    baseDurationSec: 180,
  },
  {
    id: 'energy_from_tritium_cell',
    buildingTypeId: 'atomic_reactor',
    name: { ru: 'Усиленный атомный энергоблок', en: 'Advanced Atomic Power Cell' },
    description: {
      ru: 'Абстрактный высокоуровневый цикл для большой зарядки аккумуляторов через закрытый энергоблок.',
      en: 'Abstract high-tier cycle for a large battery charge through a sealed power cell.',
    },
    output: { resourceId: 'energy', amount: 1300 },
    inputs: [
      { resourceId: 'tritium', amount: 0.25 },
      { resourceId: 'liquid_nitrogen', amount: 1 },
      { resourceId: 'water', amount: 2 },
    ],
    baseDurationSec: 240,
  },
  {
    id: 'liquid_nitrogen_from_nitrogen_ice',
    buildingTypeId: 'cryo_factory',
    name: { ru: 'Жидкий азот', en: 'Liquid Nitrogen' },
    description: {
      ru: 'Охлаждает азот с помощью льда для лазерных систем.',
      en: 'Cools nitrogen using ice for laser systems.',
    },
    output: { resourceId: 'liquid_nitrogen', amount: 1 },
    inputs: [
      { resourceId: 'nitrogen', amount: 2 },
      { resourceId: 'ice', amount: 1 },
    ],
    baseDurationSec: 15,
  },
  {
    id: 'military_alloy_from_iron_silver',
    buildingTypeId: 'smelter',
    name: { ru: 'Военный сплав', en: 'Military Alloy' },
    description: {
      ru: 'Прочный сплав на основе железа и серебра для легких корпусов.',
      en: 'Durable iron and silver alloy for light hulls.',
    },
    output: { resourceId: 'military_alloy', amount: 1 },
    inputs: [
      { resourceId: 'iron', amount: 4 },
      { resourceId: 'silver', amount: 1 },
    ],
    baseDurationSec: 20,
  },
  {
    id: 'military_composite_from_carbon_silicon',
    buildingTypeId: 'fabrication_bay',
    name: { ru: 'Военный композит', en: 'Military Composite' },
    description: {
      ru: 'Армированный композит для легкого вооружения.',
      en: 'Reinforced composite for light weapons.',
    },
    output: { resourceId: 'military_composite', amount: 1 },
    inputs: [
      { resourceId: 'carbon', amount: 3 },
      { resourceId: 'silicon', amount: 2 },
      { resourceId: 'nitrogen', amount: 1 },
    ],
    baseDurationSec: 30,
  },
];

export function recipesForBuildingType(buildingTypeId: string): ProductionRecipe[] {
  return PRODUCTION_RECIPES.filter((recipe) => recipe.buildingTypeId === buildingTypeId);
}

export function findProductionRecipe(recipeId: string): ProductionRecipe | undefined {
  return PRODUCTION_RECIPES.find((recipe) => recipe.id === recipeId);
}
