import { db } from '../index.js';
import { resources } from '../schema/resources.js';

const resourceData = [
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
  { id: 'sulfur', symbol: 'S', tier: 2, name: { ru: 'Сера', en: 'Sulfur' }, baseRegenRate: 15, defaultStorageCap: 2500 },

  { id: 'mercury', symbol: 'Hg', tier: 3, name: { ru: 'Ртуть', en: 'Mercury' }, baseRegenRate: 5, defaultStorageCap: 1000 },
  { id: 'magnesium', symbol: 'Mg', tier: 3, name: { ru: 'Магний', en: 'Magnesium' }, baseRegenRate: 5, defaultStorageCap: 1000 },
  { id: 'lead', symbol: 'Pb', tier: 3, name: { ru: 'Свинец', en: 'Lead' }, baseRegenRate: 5, defaultStorageCap: 1000 },
  { id: 'uranium', symbol: 'U', tier: 3, name: { ru: 'Уран', en: 'Uranium' }, baseRegenRate: 2, defaultStorageCap: 1000 },
  { id: 'cobalt', symbol: 'Co', tier: 3, name: { ru: 'Кобальт', en: 'Cobalt' }, baseRegenRate: 3, defaultStorageCap: 1000 },
  { id: 'silicon_carbide', symbol: 'SiC', tier: 3, name: { ru: 'Карбид кремния', en: 'Silicon Carbide' }, baseRegenRate: 4, defaultStorageCap: 1000 },
  { id: 'tritium', symbol: 'T', tier: 3, name: { ru: 'Тритий', en: 'Tritium' }, baseRegenRate: 1, defaultStorageCap: 500 },

  { id: 'antimatter', symbol: 'Am', tier: 4, name: { ru: 'Антиматерия', en: 'Antimatter' }, baseRegenRate: 0, defaultStorageCap: 100 },
  { id: 'dark_matter', symbol: 'Dm', tier: 4, name: { ru: 'Тёмная материя', en: 'Dark Matter' }, baseRegenRate: 0, defaultStorageCap: 100 },
  { id: 'iridium', symbol: 'Ir', tier: 4, name: { ru: 'Иридий', en: 'Iridium' }, baseRegenRate: 0, defaultStorageCap: 100 },
  { id: 'biomass', symbol: 'Bio', tier: 4, name: { ru: 'Биомасса', en: 'Biomass' }, baseRegenRate: 0, defaultStorageCap: 1000 },
];

export async function seedResources() {
  console.log('Seeding resources...');
  for (const row of resourceData) {
    await db.insert(resources).values(row).onConflictDoUpdate({
      target: resources.id,
      set: row,
    });
  }
}
