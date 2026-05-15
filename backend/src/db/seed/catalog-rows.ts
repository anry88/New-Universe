/**
 * Pure catalog row snapshots shared by seeders and `audit.ts`.
 * Importing this module does **not** open a database connection (unlike `resources.ts`, etc.).
 */
import type { buildingTypes } from '../schema/buildings.js';
import type { resources } from '../schema/resources.js';
import type { shipTypes } from '../schema/ships.js';
import * as resourceExtractionRatesModule from '@shared/config/resourceExtractionRates.js';
import * as buildingUpgradeEconomyModule from '@shared/config/buildingUpgradeEconomy.js';
import type { CombatStats } from '@shared/types/combat.js';

export type ResourceCatalogRow = typeof resources.$inferInsert;
export type BuildingCatalogRow = typeof buildingTypes.$inferInsert;
export type ShipCatalogRow = typeof shipTypes.$inferInsert;

type ResourceExtractionRatesModule = typeof import('@shared/config/resourceExtractionRates.js');
type BuildingUpgradeEconomyModule = typeof import('@shared/config/buildingUpgradeEconomy.js');

// Local `tsx src/db/seed.ts` can expose @shared TS modules through a CJS
// default export, while Vitest/tsc see normal ESM named exports.
const resourceExtractionRatesInterop = resourceExtractionRatesModule as ResourceExtractionRatesModule & {
  default?: ResourceExtractionRatesModule;
};
const buildingUpgradeEconomyInterop = buildingUpgradeEconomyModule as BuildingUpgradeEconomyModule & {
  default?: BuildingUpgradeEconomyModule;
};

const EXTRACTABLE_RESOURCE_RATES_PER_HOUR =
  resourceExtractionRatesInterop.EXTRACTABLE_RESOURCE_RATES_PER_HOUR ??
  resourceExtractionRatesInterop.default!.EXTRACTABLE_RESOURCE_RATES_PER_HOUR;
const MAX_BUILDING_LEVEL =
  buildingUpgradeEconomyInterop.MAX_BUILDING_LEVEL ??
  buildingUpgradeEconomyInterop.default!.MAX_BUILDING_LEVEL;

export const RESOURCE_CATALOG_ROWS: ResourceCatalogRow[] = [
  { id: 'energy', symbol: 'E', tier: 1, name: { ru: 'Энергия', en: 'Energy' }, baseRegenRate: 0, defaultStorageCap: 0 },
  { id: 'water', symbol: 'H₂O', tier: 1, name: { ru: 'Вода', en: 'Water' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.water, defaultStorageCap: 5000 },
  { id: 'iron', symbol: 'Fe', tier: 1, name: { ru: 'Железо', en: 'Iron' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.iron, defaultStorageCap: 5000 },
  { id: 'carbon', symbol: 'C', tier: 1, name: { ru: 'Углерод', en: 'Carbon' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.carbon, defaultStorageCap: 5000 },
  { id: 'silicon', symbol: 'Si', tier: 1, name: { ru: 'Кремний', en: 'Silicon' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.silicon, defaultStorageCap: 5000 },
  { id: 'methane', symbol: 'CH₄', tier: 1, name: { ru: 'Метан', en: 'Methane' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.methane, defaultStorageCap: 5000 },
  { id: 'oxygen', symbol: 'O₂', tier: 1, name: { ru: 'Кислород', en: 'Oxygen' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.oxygen, defaultStorageCap: 5000 },
  { id: 'hydrogen', symbol: 'H₂', tier: 1, name: { ru: 'Водород', en: 'Hydrogen' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.hydrogen, defaultStorageCap: 5000 },
  { id: 'fuel', symbol: 'Fuel', tier: 1, name: { ru: 'Топливо', en: 'Fuel' }, baseRegenRate: 0, defaultStorageCap: 1000 },

  { id: 'copper', symbol: 'Cu', tier: 2, name: { ru: 'Медь', en: 'Copper' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.copper, defaultStorageCap: 2500 },
  { id: 'aluminum', symbol: 'Al', tier: 2, name: { ru: 'Алюминий', en: 'Aluminum' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.aluminum, defaultStorageCap: 2500 },
  { id: 'silver', symbol: 'Ag', tier: 2, name: { ru: 'Серебро', en: 'Silver' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.silver, defaultStorageCap: 2500 },
  { id: 'titanium', symbol: 'Ti', tier: 2, name: { ru: 'Титан', en: 'Titanium' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.titanium, defaultStorageCap: 2500 },
  { id: 'ice', symbol: 'Ice', tier: 2, name: { ru: 'Лёд', en: 'Ice' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.ice, defaultStorageCap: 2500 },
  { id: 'oil', symbol: 'Oil', tier: 2, name: { ru: 'Нефть', en: 'Oil' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.oil, defaultStorageCap: 2500 },
  { id: 'sulfur', symbol: 'S', tier: 2, name: { ru: 'Сера', en: 'Sulfur' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.sulfur, defaultStorageCap: 2500 },
  { id: 'steel', symbol: 'St', tier: 2, name: { ru: 'Сталь', en: 'Steel' }, baseRegenRate: 0, defaultStorageCap: 2500 },
  {
    id: 'electronics',
    symbol: 'EC',
    tier: 2,
    name: { ru: 'Электроника', en: 'Electronics' },
    baseRegenRate: 0,
    defaultStorageCap: 2500,
  },

  { id: 'mercury', symbol: 'Hg', tier: 3, name: { ru: 'Ртуть', en: 'Mercury' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.mercury, defaultStorageCap: 1000 },
  { id: 'magnesium', symbol: 'Mg', tier: 3, name: { ru: 'Магний', en: 'Magnesium' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.magnesium, defaultStorageCap: 1000 },
  { id: 'lead', symbol: 'Pb', tier: 3, name: { ru: 'Свинец', en: 'Lead' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.lead, defaultStorageCap: 1000 },
  { id: 'nitrogen', symbol: 'N₂', tier: 3, name: { ru: 'Азот', en: 'Nitrogen' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.nitrogen, defaultStorageCap: 1000 },
  { id: 'uranium', symbol: 'U', tier: 3, name: { ru: 'Уран', en: 'Uranium' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.uranium, defaultStorageCap: 1000 },
  { id: 'cobalt', symbol: 'Co', tier: 3, name: { ru: 'Кобальт', en: 'Cobalt' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.cobalt, defaultStorageCap: 1000 },
  {
    id: 'silicon_carbide',
    symbol: 'SiC',
    tier: 3,
    name: { ru: 'Карбид кремния', en: 'Silicon Carbide' },
    baseRegenRate: 0,
    defaultStorageCap: 1000,
  },
  { id: 'tritium', symbol: 'T', tier: 3, name: { ru: 'Тритий', en: 'Tritium' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.tritium, defaultStorageCap: 500 },
  { id: 'gold', symbol: 'Au', tier: 3, name: { ru: 'Золото', en: 'Gold' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.gold, defaultStorageCap: 1000 },
  { id: 'jump_fuel', symbol: 'JF', tier: 3, name: { ru: 'Прыжковое топливо', en: 'Jump Fuel' }, baseRegenRate: 0, defaultStorageCap: 500 },

  { id: 'antimatter', symbol: 'Am', tier: 4, name: { ru: 'Антиматерия', en: 'Antimatter' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.antimatter, defaultStorageCap: 100 },
  { id: 'iridium', symbol: 'Ir', tier: 4, name: { ru: 'Иридий', en: 'Iridium' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.iridium, defaultStorageCap: 100 },
  { id: 'biomass', symbol: 'Bio', tier: 4, name: { ru: 'Биомасса', en: 'Biomass' }, baseRegenRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.biomass, defaultStorageCap: 1000 },
  { id: 'liquid_nitrogen', symbol: 'LN₂', tier: 3, name: { ru: 'Жидкий азот', en: 'Liquid Nitrogen' }, baseRegenRate: 0, defaultStorageCap: 1000 },
  { id: 'military_alloy', symbol: 'MA', tier: 3, name: { ru: 'Военный сплав', en: 'Military Alloy' }, baseRegenRate: 0, defaultStorageCap: 1000 },
  { id: 'military_composite', symbol: 'MC', tier: 3, name: { ru: 'Военный композит', en: 'Military Composite' }, baseRegenRate: 0, defaultStorageCap: 1000 },
];

/**
 * Building upgrade economics (backend `BuildingService.upgrade` + `features/buildings/upgrade.ts`):
 * - Cost for upgrading from level L → L+1: `floor(baseCost * 1.6^L)` per resource.
 * - Time: `floor(baseTimeSec * 1.8^L)` before research build-speed modifiers.
 * Initial construction pays listed `baseCost` / `baseTimeSec` without these multipliers.
 */
export const BUILDING_TYPE_CATALOG_ROWS: BuildingCatalogRow[] = [
  {
    id: 'command_center',
    name: { ru: 'Командный центр', en: 'Command Center' },
    description: {
      ru: 'Административный узел вашей колонии. Позволяет строить новые здания.',
      en: 'Administrative hub of your colony. Enables new building construction.',
    },
    category: 'base',
    maxPerPlanet: 1,
    maxGlobal: null,
    maxLevel: MAX_BUILDING_LEVEL,
    deps: [],
    baseCost: { iron: 80, carbon: 40, silicon: 10 },
    baseTimeSec: 600,
    baseOutput: {},
    energyConsumption: 0,
    combatStats: { targetClass: 'command_center' } as CombatStats,
  },
  {
    // Solid-resource surface mine. Pairs with the gases-only `drill` below;
    // the two were previously identical except for output — they are now
    // semantically distinct buildings with different costs, deps and
    // biome affinities.
    id: 'mine',
    name: { ru: 'Шахта', en: 'Mine' },
    description: {
      ru: 'Добывает твёрдые минеральные ресурсы из выбранного местного месторождения.',
      en: 'Extracts solid mineral resources from the selected local deposit.',
    },
    category: 'production',
    maxLevel: MAX_BUILDING_LEVEL,
    deps: [{ typeId: 'command_center', level: 1 }],
    // Heavier upfront iron cost reflects building reinforced ore-haulers.
    baseCost: { iron: 120, carbon: 40 },
    baseTimeSec: 300,
    baseOutput: { resourceId: 'iron', baseRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.iron },
    energyConsumption: 10,
  },
  {
    // Gases-only extractor. Water and biomass moved to the bioreactor,
    // while oil/methane hydrocarbon pockets belong to the oil pump.
    id: 'drill',
    name: { ru: 'Газовый экстрактор', en: 'Gas Extractor' },
    description: {
      ru: 'Добывает газы из выбранного местного источника.',
      en: 'Extracts gases from the selected local source.',
    },
    category: 'production',
    maxLevel: MAX_BUILDING_LEVEL,
    // Slightly different gate: needs a tier-1 solar plant (electronics for
    // the condenser) so it cannot trivially overlap the mine.
    deps: [
      { typeId: 'command_center', level: 1 },
      { typeId: 'solar_plant', level: 1 },
    ],
    baseCost: { silicon: 100, carbon: 80 },
    baseTimeSec: 360,
    baseOutput: { resourceId: 'methane', baseRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.methane },
    energyConsumption: 14,
  },
  {
    id: 'storage',
    name: { ru: 'Склад', en: 'Storage' },
    description: {
      ru: 'Увеличивает вместимость хранилищ для всех типов ресурсов на планете.',
      en: 'Increases storage capacity for all types of resources on the planet.',
    },
    category: 'logistics',
    maxLevel: MAX_BUILDING_LEVEL,
    deps: [{ typeId: 'command_center', level: 1 }],
    baseCost: { iron: 150, carbon: 50 },
    baseTimeSec: 600,
    baseOutput: { cap: 5000 },
    energyConsumption: 5,
  },
  {
    id: 'battery',
    name: { ru: 'Аккумулятор', en: 'Battery' },
    description: {
      ru: 'Обязательное энергетическое хранилище колонии. Накапливает избыток генерации и питает здания при просадках.',
      en: 'Mandatory colony energy storage. Stores surplus generation and powers buildings during deficits.',
    },
    category: 'energy',
    maxLevel: MAX_BUILDING_LEVEL,
    deps: [{ typeId: 'command_center', level: 1 }],
    baseCost: { iron: 120, silicon: 90, carbon: 40 },
    baseTimeSec: 420,
    baseOutput: { energyCap: 500 },
    energyConsumption: 0,
  },
  {
    id: 'oil_pump',
    name: { ru: 'Нефтекачка', en: 'Oil Pump' },
    description: {
      ru: 'Добывает нефть или метан из выбранного местного углеводородного пласта.',
      en: 'Extracts oil or methane from the selected local hydrocarbon reservoir.',
    },
    category: 'production',
    maxLevel: MAX_BUILDING_LEVEL,
    deps: [{ typeId: 'command_center', level: 2 }],
    baseCost: { iron: 220, silicon: 140, carbon: 120 },
    baseTimeSec: 720,
    baseOutput: { resourceId: 'oil', baseRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.oil },
    energyConsumption: 12,
  },
  {
    id: 'biomass_harvester',
    name: { ru: 'Биореактор', en: 'Bioreactor' },
    description: {
      ru: 'Поддерживает жизнеобеспечение, добывая воду или культивируя биомассу из местного источника.',
      en: 'Supports life support by extracting water or culturing biomass from the local source.',
    },
    category: 'production',
    maxLevel: MAX_BUILDING_LEVEL,
    deps: [{ typeId: 'command_center', level: 2 }],
    baseCost: { iron: 180, carbon: 160, water: 120 },
    baseTimeSec: 840,
    baseOutput: { resourceId: 'biomass', baseRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.biomass },
    energyConsumption: 18,
  },
  {
    id: 'smelter',
    name: { ru: 'Завод', en: 'Smelter' },
    description: {
      ru: 'Перерабатывает сырьё в очищенные конструкционные материалы.',
      en: 'Processes raw inputs into refined structural materials.',
    },
    category: 'production',
    maxLevel: MAX_BUILDING_LEVEL,
    deps: [{ typeId: 'command_center', level: 3 }],
    baseCost: { iron: 400, silicon: 200 },
    baseTimeSec: 900,
    baseOutput: {},
    energyConsumption: 30,
  },
  {
    id: 'refinery',
    name: { ru: 'Нефтеперерабатывающий завод', en: 'Refinery' },
    description: {
      ru: 'Перерабатывает углеводородное сырьё в корабельное топливо.',
      en: 'Processes hydrocarbon feedstock into ship fuel.',
    },
    category: 'production',
    maxLevel: MAX_BUILDING_LEVEL,
    deps: [{ typeId: 'command_center', level: 3 }],
    baseCost: { iron: 550, silicon: 320, steel: 180 },
    baseTimeSec: 1500,
    baseOutput: {},
    energyConsumption: 28,
  },
  {
    id: 'fabrication_bay',
    name: { ru: 'Цех электроники', en: 'Fabrication Bay' },
    description: {
      ru: 'Собирает электронные компоненты из проводников и очищенных материалов.',
      en: 'Assembles electronic components from conductors and refined materials.',
    },
    category: 'production',
    maxLevel: MAX_BUILDING_LEVEL,
    deps: [{ typeId: 'command_center', level: 3 }],
    baseCost: { iron: 450, silicon: 350, carbon: 150, steel: 120 },
    baseTimeSec: 1200,
    baseOutput: {},
    energyConsumption: 28,
  },
  {
    id: 'spaceport',
    name: { ru: 'Космопорт', en: 'Spaceport' },
    description: {
      ru: 'Обеспечивает логистику и запуск кораблей. Необходим для флота.',
      en: 'Provides logistics and ship launching. Required for fleet operations.',
    },
    category: 'ships',
    maxLevel: MAX_BUILDING_LEVEL,
    deps: [{ typeId: 'command_center', level: 4 }],
    baseCost: { iron: 500, carbon: 500 },
    baseTimeSec: 1200,
    baseOutput: {},
    energyConsumption: 20,
  },
  {
    id: 'shipyard',
    name: { ru: 'Верфь', en: 'Shipyard' },
    description: {
      ru: 'Позволяет строить и ремонтировать космические корабли.',
      en: 'Enables construction and repair of spacecraft.',
    },
    category: 'ships',
    maxLevel: MAX_BUILDING_LEVEL,
    deps: [{ typeId: 'spaceport', level: 1 }],
    baseCost: { iron: 800, silicon: 400 },
    baseTimeSec: 1800,
    baseOutput: {},
    energyConsumption: 40,
  },
  {
    id: 'lab',
    name: { ru: 'Лаборатория', en: 'Laboratory' },
    description: {
      ru: 'Центр научных исследований. Разблокирует новые технологии.',
      en: 'Center for scientific research. Unlocks new technologies.',
    },
    category: 'progress',
    maxPerPlanet: null,
    maxGlobal: 1,
    maxLevel: MAX_BUILDING_LEVEL,
    deps: [{ typeId: 'command_center', level: 3 }],
    baseCost: { iron: 300, silicon: 600 },
    baseTimeSec: 1800,
    baseOutput: {},
    energyConsumption: 30,
  },
  {
    id: 'cryo_factory',
    name: { ru: 'Криогенный завод', en: 'Cryo Factory' },
    description: {
      ru: 'Управляет криогенной переработкой воды и льда.',
      en: 'Handles cryogenic processing of water and ice.',
    },
    category: 'production',
    maxLevel: MAX_BUILDING_LEVEL,
    deps: [{ typeId: 'command_center', level: 3 }],
    baseCost: { iron: 600, silicon: 200, magnesium: 50 },
    baseTimeSec: 2700,
    baseOutput: {},
    energyConsumption: 40,
  },
  {
    id: 'solar_plant',
    name: { ru: 'Солнечная станция', en: 'Solar Plant' },
    description: {
      ru: 'Генерирует энергию из солнечного излучения для питания базы.',
      en: 'Generates energy from solar radiation to power the base.',
    },
    category: 'energy',
    maxLevel: MAX_BUILDING_LEVEL,
    deps: [{ typeId: 'command_center', level: 1 }],
    baseCost: { silicon: 150, iron: 50 },
    baseTimeSec: 600,
    baseOutput: { energy: 50 },
    energyConsumption: 0,
  },
  {
    id: 'wind_turbine',
    name: { ru: 'Ветротурбина', en: 'Wind Turbine' },
    description: {
      ru: 'Генерирует энергию из атмосферных потоков. Крупные планеты дают более стабильный поток.',
      en: 'Generates energy from atmospheric currents. Larger planets provide steadier output.',
    },
    category: 'energy',
    maxLevel: MAX_BUILDING_LEVEL,
    deps: [{ typeId: 'command_center', level: 1 }],
    baseCost: { iron: 140, aluminum: 60, silicon: 60 },
    baseTimeSec: 720,
    baseOutput: { energy: 38 },
    energyConsumption: 0,
  },
  {
    id: 'fuel_generator',
    name: { ru: 'Топливный генератор', en: 'Fuel Generator' },
    description: {
      ru: 'Заряжает аккумуляторы топливом, нефтью или метаном с разной энергоотдачей.',
      en: 'Charges batteries with fuel, oil, or methane at different energy yields.',
    },
    category: 'energy',
    maxLevel: MAX_BUILDING_LEVEL,
    deps: [{ typeId: 'command_center', level: 2 }],
    baseCost: { iron: 220, silicon: 120, steel: 80 },
    baseTimeSec: 900,
    baseOutput: {},
    energyConsumption: 0,
  },
];

export const SHIP_TYPE_CATALOG_ROWS: ShipCatalogRow[] = [
  {
    id: 'scout',
    name: { ru: 'Разведчик', en: 'Scout' },
    role: 'recon',
    hp: 40,
    speed: '2.00',
    cargo: 50,
    dps: 0,
    armor: 0,
    fuelConsumption: '0.30',
    buildTimeSec: 600,
    buildCost: { iron: 100, silicon: 50, fuel: 30 },
    requiredBuildings: [{ typeId: 'shipyard', level: 1 }],
    sensorRange: 30,
    combatStats: { targetClass: 'civilian' } as CombatStats,
  },
  {
    id: 'cargo_light',
    name: { ru: 'Лёгкий транспорт', en: 'Lightweight Transporter' },
    role: 'logistics',
    hp: 60,
    speed: '1.20',
    cargo: 5000,
    dps: 0,
    armor: 0,
    fuelConsumption: '0.80',
    buildTimeSec: 1200,
    buildCost: { iron: 500, silicon: 300, carbon: 200, methane: 100 },
    requiredBuildings: [{ typeId: 'shipyard', level: 2 }],
    sensorRange: 8,
    combatStats: { targetClass: 'civilian' } as CombatStats,
  },
  {
    id: 'colonizer',
    name: { ru: 'Колонизатор', en: 'Colonizer' },
    role: 'colonization',
    hp: 120,
    speed: '1.00',
    cargo: 1,
    dps: 0,
    armor: 0,
    fuelConsumption: '1.50',
    buildTimeSec: 14400,
    buildCost: { steel: 2500, silicon: 800, biomass: 400 },
    requiredBuildings: [{ typeId: 'shipyard', level: 1 }],
    sensorRange: 10,
    combatStats: { targetClass: 'civilian' } as CombatStats,
  },
  {
    id: 'recon_probe',
    name: { ru: 'Разведывательный зонд', en: 'Recon Probe' },
    role: 'exploration',
    hp: 20,
    speed: '4.00',
    cargo: 0,
    dps: 0,
    armor: 0,
    fuelConsumption: '0.10',
    buildTimeSec: 300,
    buildCost: { silicon: 40, fuel: 20, electronics: 10 },
    requiredBuildings: [{ typeId: 'shipyard', level: 1 }],
    sensorRange: 60,
    combatStats: { targetClass: 'civilian' } as CombatStats,
  },
  {
    id: 'fighter',
    name: { ru: 'Истребитель', en: 'Fighter' },
    role: 'combat',
    hp: 400,
    speed: '3.00',
    cargo: 0,
    dps: 50,
    armor: 10,
    fuelConsumption: '0.50',
    buildTimeSec: 1800,
    buildCost: { iron: 300, silicon: 200, fuel: 50 },
    requiredBuildings: [{ typeId: 'shipyard', level: 1 }],
    sensorRange: 20,
    combatStats: { targetClass: 'military_light' } as CombatStats,
  },
  {
    id: 'cruiser',
    name: { ru: 'Крейсер', en: 'Cruiser' },
    role: 'combat',
    hp: 1500,
    speed: '1.50',
    cargo: 500,
    dps: 200,
    armor: 50,
    fuelConsumption: '2.00',
    buildTimeSec: 7200,
    buildCost: { steel: 1000, electronics: 300, fuel: 200 },
    requiredBuildings: [{ typeId: 'shipyard', level: 3 }],
    sensorRange: 40,
    combatStats: { targetClass: 'military_medium' } as CombatStats,
  },
  {
    id: 'battleship',
    name: { ru: 'Линкор', en: 'Battleship' },
    role: 'combat',
    hp: 5000,
    speed: '1.00',
    cargo: 1000,
    dps: 800,
    armor: 150,
    fuelConsumption: '5.00',
    buildTimeSec: 28800,
    buildCost: { steel: 4000, electronics: 1500, jump_fuel: 10 },
    requiredBuildings: [{ typeId: 'shipyard', level: 5 }],
    sensorRange: 60,
    combatStats: { targetClass: 'military_heavy' } as CombatStats,
  },
];
