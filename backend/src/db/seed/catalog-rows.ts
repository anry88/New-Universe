/**
 * Pure catalog row snapshots shared by seeders and `audit.ts`.
 * Importing this module does **not** open a database connection (unlike `resources.ts`, etc.).
 */
import type { buildingTypes } from '../schema/buildings.js';
import type { resources } from '../schema/resources.js';
import type { shipTypes } from '../schema/ships.js';

export type ResourceCatalogRow = typeof resources.$inferInsert;
export type BuildingCatalogRow = typeof buildingTypes.$inferInsert;
export type ShipCatalogRow = typeof shipTypes.$inferInsert;

export const RESOURCE_CATALOG_ROWS: ResourceCatalogRow[] = [
  { id: 'water', symbol: 'H₂O', tier: 1, name: { ru: 'Вода', en: 'Water' }, baseRegenRate: 60, defaultStorageCap: 5000 },
  { id: 'iron', symbol: 'Fe', tier: 1, name: { ru: 'Железо', en: 'Iron' }, baseRegenRate: 50, defaultStorageCap: 5000 },
  { id: 'carbon', symbol: 'C', tier: 1, name: { ru: 'Углерод', en: 'Carbon' }, baseRegenRate: 40, defaultStorageCap: 5000 },
  { id: 'silicon', symbol: 'Si', tier: 1, name: { ru: 'Кремний', en: 'Silicon' }, baseRegenRate: 30, defaultStorageCap: 5000 },
  { id: 'methane', symbol: 'CH₄', tier: 1, name: { ru: 'Метан', en: 'Methane' }, baseRegenRate: 40, defaultStorageCap: 5000 },
  { id: 'fuel', symbol: 'Fuel', tier: 1, name: { ru: 'Топливо', en: 'Fuel' }, baseRegenRate: 0, defaultStorageCap: 1000 },

  { id: 'copper', symbol: 'Cu', tier: 2, name: { ru: 'Медь', en: 'Copper' }, baseRegenRate: 20, defaultStorageCap: 2500 },
  { id: 'aluminum', symbol: 'Al', tier: 2, name: { ru: 'Алюминий', en: 'Aluminum' }, baseRegenRate: 15, defaultStorageCap: 2500 },
  { id: 'titanium', symbol: 'Ti', tier: 2, name: { ru: 'Титан', en: 'Titanium' }, baseRegenRate: 10, defaultStorageCap: 2500 },
  { id: 'ice', symbol: 'Ice', tier: 2, name: { ru: 'Лёд', en: 'Ice' }, baseRegenRate: 20, defaultStorageCap: 2500 },
  { id: 'oil', symbol: 'Oil', tier: 2, name: { ru: 'Нефть', en: 'Oil' }, baseRegenRate: 0, defaultStorageCap: 2500 },
  { id: 'sulfur', symbol: 'S', tier: 2, name: { ru: 'Сера', en: 'Sulfur' }, baseRegenRate: 15, defaultStorageCap: 2500 },
  { id: 'steel', symbol: 'St', tier: 2, name: { ru: 'Сталь', en: 'Steel' }, baseRegenRate: 0, defaultStorageCap: 2500 },
  {
    id: 'electronics',
    symbol: 'EC',
    tier: 2,
    name: { ru: 'Электроника', en: 'Electronics' },
    baseRegenRate: 0,
    defaultStorageCap: 2500,
  },

  { id: 'mercury', symbol: 'Hg', tier: 3, name: { ru: 'Ртуть', en: 'Mercury' }, baseRegenRate: 5, defaultStorageCap: 1000 },
  { id: 'magnesium', symbol: 'Mg', tier: 3, name: { ru: 'Магний', en: 'Magnesium' }, baseRegenRate: 5, defaultStorageCap: 1000 },
  { id: 'lead', symbol: 'Pb', tier: 3, name: { ru: 'Свинец', en: 'Lead' }, baseRegenRate: 5, defaultStorageCap: 1000 },
  { id: 'uranium', symbol: 'U', tier: 3, name: { ru: 'Уран', en: 'Uranium' }, baseRegenRate: 2, defaultStorageCap: 1000 },
  { id: 'cobalt', symbol: 'Co', tier: 3, name: { ru: 'Кобальт', en: 'Cobalt' }, baseRegenRate: 3, defaultStorageCap: 1000 },
  {
    id: 'silicon_carbide',
    symbol: 'SiC',
    tier: 3,
    name: { ru: 'Карбид кремния', en: 'Silicon Carbide' },
    baseRegenRate: 4,
    defaultStorageCap: 1000,
  },
  { id: 'tritium', symbol: 'T', tier: 3, name: { ru: 'Тритий', en: 'Tritium' }, baseRegenRate: 1, defaultStorageCap: 500 },

  { id: 'antimatter', symbol: 'Am', tier: 4, name: { ru: 'Антиматерия', en: 'Antimatter' }, baseRegenRate: 0, defaultStorageCap: 100 },
  { id: 'dark_matter', symbol: 'Dm', tier: 4, name: { ru: 'Тёмная материя', en: 'Dark Matter' }, baseRegenRate: 0, defaultStorageCap: 100 },
  { id: 'iridium', symbol: 'Ir', tier: 4, name: { ru: 'Иридий', en: 'Iridium' }, baseRegenRate: 0, defaultStorageCap: 100 },
  { id: 'biomass', symbol: 'Bio', tier: 4, name: { ru: 'Биомасса', en: 'Biomass' }, baseRegenRate: 0, defaultStorageCap: 1000 },
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
    maxLevel: 20,
    deps: [],
    baseCost: { iron: 80, carbon: 40, silicon: 10 },
    baseTimeSec: 600,
    baseOutput: {},
    energyConsumption: 0,
  },
  {
    // Metals-only surface mine. Pairs with `drill` (fluids/gases) below;
    // the two were previously identical except for output — they are now
    // semantically distinct buildings with different costs, deps and
    // biome affinities.
    id: 'mine',
    name: { ru: 'Шахта', en: 'Metals Mine' },
    description: {
      ru: 'Открытая разработка твёрдых пород. Добывает металлы — железо, медь, алюминий — на каменистых и вулканических планетах.',
      en: 'Open-pit metal extraction. Produces iron, copper and aluminum on rocky and volcanic planets.',
    },
    category: 'production',
    maxLevel: 30,
    deps: [{ typeId: 'command_center', level: 1 }],
    // Heavier upfront iron cost reflects building reinforced ore-haulers.
    baseCost: { iron: 120, carbon: 40 },
    baseTimeSec: 300,
    baseOutput: { resourceId: 'iron', baseRate: 50 },
    energyConsumption: 10,
  },
  {
    // Fluids/gases extractor. Previously named "Deep Drill" with the same
    // cost/deps as `mine` — now reworked into a downstream-feeding fluid
    // pipeline that produces water (default), methane or oil depending on
    // the planet biome.
    id: 'drill',
    name: { ru: 'Газожидкостной экстрактор', en: 'Fluid Extractor' },
    description: {
      ru: 'Криогенные и газоконденсатные скважины. Качает воду, метан и нефть на океанических, ледяных и газовых планетах.',
      en: 'Cryogenic and gas-condensate wells. Pumps water, methane and oil on ocean, ice and gas-giant planets.',
    },
    category: 'production',
    maxLevel: 30,
    // Slightly different gate: needs a tier-1 solar plant (electronics for
    // the condenser) so it cannot trivially overlap the mine.
    deps: [
      { typeId: 'command_center', level: 1 },
      { typeId: 'solar_plant', level: 1 },
    ],
    baseCost: { silicon: 100, carbon: 80 },
    baseTimeSec: 360,
    baseOutput: { resourceId: 'water', baseRate: 60 },
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
    maxLevel: 25,
    deps: [{ typeId: 'command_center', level: 1 }],
    baseCost: { iron: 150, carbon: 50 },
    baseTimeSec: 600,
    baseOutput: { cap: 5000 },
    energyConsumption: 5,
  },
  {
    id: 'oil_pump',
    name: { ru: 'Нефтекачка', en: 'Oil Pump' },
    description: {
      ru: 'Добывает сырую нефть из био-залежей для дальнейшей переработки.',
      en: 'Extracts crude oil from biological deposits for downstream refining.',
    },
    category: 'production',
    maxLevel: 20,
    deps: [{ typeId: 'command_center', level: 2 }],
    baseCost: { iron: 220, silicon: 140, carbon: 120 },
    baseTimeSec: 720,
    baseOutput: { resourceId: 'oil', baseRate: 45 },
    energyConsumption: 12,
  },
  {
    id: 'biomass_harvester',
    name: { ru: 'Биореактор', en: 'Biomass Harvester' },
    description: {
      ru: 'Собирает и культивирует биомассу на планетах с биологическими залежами.',
      en: 'Harvests and cultures biomass on planets with biological deposits.',
    },
    category: 'production',
    maxLevel: 20,
    deps: [{ typeId: 'command_center', level: 2 }],
    baseCost: { iron: 180, carbon: 160, water: 120 },
    baseTimeSec: 840,
    baseOutput: { resourceId: 'biomass', baseRate: 18 },
    energyConsumption: 18,
  },
  {
    id: 'smelter',
    name: { ru: 'Завод', en: 'Smelter' },
    description: {
      ru: 'Запускает ручные заказы переработки сырья в очищенные материалы, например железо и воду в сталь.',
      en: 'Runs manual processing orders that refine raw materials, such as iron and water into steel.',
    },
    category: 'production',
    maxLevel: 20,
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
      ru: 'Запускает ручные заказы производства топлива из нефти, метана и вспомогательных реагентов.',
      en: 'Runs manual fuel production orders from oil, methane, and supporting reagents.',
    },
    category: 'production',
    maxLevel: 15,
    deps: [
      { typeId: 'command_center', level: 3 },
      { typeId: 'smelter', level: 2 },
    ],
    baseCost: { iron: 550, silicon: 320, steel: 180 },
    baseTimeSec: 1500,
    baseOutput: {},
    energyConsumption: 28,
  },
  {
    id: 'fabrication_bay',
    name: { ru: 'Цех электроники', en: 'Fabrication Bay' },
    description: {
      ru: 'Запускает ручные заказы электроники из кремния, меди, стали и продвинутых компонентов.',
      en: 'Runs manual electronics production orders from silicon, copper, steel, and advanced components.',
    },
    category: 'production',
    maxLevel: 15,
    deps: [
      { typeId: 'command_center', level: 3 },
      { typeId: 'smelter', level: 1 },
    ],
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
    maxLevel: 10,
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
    maxLevel: 15,
    deps: [{ typeId: 'spaceport', level: 2 }],
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
    maxLevel: 20,
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
      ru: 'Запускает ручные криогенные заказы для переработки льда в воду и воды в лёд.',
      en: 'Runs manual cryogenic orders for melting ice into water and freezing water into ice.',
    },
    category: 'production',
    maxLevel: 15,
    deps: [
      { typeId: 'spaceport', level: 2 },
      { typeId: 'smelter', level: 3 },
    ],
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
    maxLevel: 20,
    deps: [{ typeId: 'command_center', level: 1 }],
    baseCost: { silicon: 150, iron: 50 },
    baseTimeSec: 600,
    baseOutput: { energy: 50 },
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
  },
  {
    id: 'cargo_light',
    name: { ru: 'Лёгкий транспорт', en: 'Cargo Light' },
    role: 'logistics',
    hp: 60,
    speed: '1.20',
    cargo: 500,
    dps: 0,
    armor: 0,
    fuelConsumption: '0.80',
    buildTimeSec: 1200,
    buildCost: { iron: 300, aluminum: 100, electronics: 50 },
    requiredBuildings: [{ typeId: 'shipyard', level: 1 }],
    sensorRange: 8,
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
  },
  {
    id: 'recon_probe',
    name: { ru: 'Разведывательный зонд', en: 'Recon Probe' },
    role: 'recon',
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
  },
  {
    id: 'jump_ship',
    name: { ru: 'Прыжковый корабль', en: 'Jump Ship' },
    role: 'exploration',
    hp: 200,
    speed: '1.60',
    cargo: 50,
    dps: 25,
    armor: 10,
    fuelConsumption: '0.60',
    buildTimeSec: 2700,
    buildCost: { steel: 1500, titanium: 500, tritium: 100 },
    requiredBuildings: [{ typeId: 'shipyard', level: 5 }],
    sensorRange: 15,
  },
];
