import { db } from '../index.js';
import { shipTypes } from '../schema/ships.js';

type ShipTypeInsert = typeof shipTypes.$inferInsert;

const shipTypeData: ShipTypeInsert[] = [
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

export async function seedShipTypes() {
  console.log('Seeding ship types...');
  for (const row of shipTypeData) {
    await db.insert(shipTypes).values(row).onConflictDoUpdate({
      target: shipTypes.id,
      set: row,
    });
  }
}
