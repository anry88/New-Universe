import { db } from '../index.js';
import { buildingTypes } from '../schema/buildings.js';

type BuildingTypeInsert = typeof buildingTypes.$inferInsert;

const buildingTypeData: BuildingTypeInsert[] = [
  {
    id: 'command_center',
    name: { ru: 'Командный центр', en: 'Command Center' },
    category: 'base',
    maxLevel: 20,
    deps: [],
    baseCost: {},
    baseTimeSec: 0,
    baseOutput: {},
    energyConsumption: 0,
  },
  {
    id: 'mine',
    name: { ru: 'Шахта', en: 'Mine' },
    category: 'production',
    maxLevel: 30,
    deps: [{ typeId: 'command_center', level: 1 }],
    baseCost: { iron: 100, silicon: 50 },
    baseTimeSec: 300,
    baseOutput: { resourceId: 'iron', baseRate: 50 },
    energyConsumption: 10,
  },
  {
    id: 'drill',
    name: { ru: 'Бур', en: 'Drill' },
    category: 'production',
    maxLevel: 30,
    deps: [{ typeId: 'command_center', level: 1 }],
    baseCost: { carbon: 100, silicon: 50 },
    baseTimeSec: 300,
    baseOutput: { resourceId: 'water', baseRate: 60 },
    energyConsumption: 10,
  },
  {
    id: 'storage',
    name: { ru: 'Склад', en: 'Storage' },
    category: 'logistics',
    maxLevel: 25,
    deps: [{ typeId: 'command_center', level: 1 }],
    baseCost: { iron: 150, carbon: 50 },
    baseTimeSec: 600,
    baseOutput: { cap: 5000 },
    energyConsumption: 5,
  },
  {
    id: 'smelter',
    name: { ru: 'Завод', en: 'Smelter' },
    category: 'production',
    maxLevel: 20,
    deps: [{ typeId: 'command_center', level: 3 }],
    baseCost: { iron: 400, silicon: 200 },
    baseTimeSec: 900,
    baseOutput: {},
    energyConsumption: 30,
  },
  {
    id: 'spaceport',
    name: { ru: 'Космопорт', en: 'Spaceport' },
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
    category: 'progress',
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
    category: 'production',
    maxLevel: 15,
    deps: [
      { typeId: 'spaceport', level: 2 },
      { typeId: 'smelter', level: 3 },
    ],
    baseCost: { iron: 600, silicon: 200, magnesium: 50 },
    baseTimeSec: 2700,
    baseOutput: { conversion: { from: 'water', to: 'ice', rate: 100 } },
    energyConsumption: 40,
  },
  {
    id: 'solar_plant',
    name: { ru: 'Солнечная станция', en: 'Solar Plant' },
    category: 'energy',
    maxLevel: 20,
    deps: [{ typeId: 'command_center', level: 1 }],
    baseCost: { silicon: 150, iron: 50 },
    baseTimeSec: 600,
    baseOutput: { energy: 50 },
    energyConsumption: 0,
  },
];

export async function seedBuildingTypes() {
  console.log('Seeding building types...');
  for (const row of buildingTypeData) {
    await db.insert(buildingTypes).values(row).onConflictDoUpdate({
      target: buildingTypes.id,
      set: row,
    });
  }
}
