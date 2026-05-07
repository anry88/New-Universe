import { db } from '../index.js';
import { researchBranches } from '../schema/research.js';

const researchData = [
  { id: 'mining', name: { ru: 'Добыча ресурсов', en: 'Resource Mining' } },
  { id: 'engineering', name: { ru: 'Инженерия', en: 'Engineering' } },
  { id: 'engines', name: { ru: 'Двигатели', en: 'Engines' } },
  { id: 'weapons', name: { ru: 'Вооружение', en: 'Weapons' } },
  { id: 'sensors', name: { ru: 'Сенсоры', en: 'Sensors' } },
  { id: 'logistics', name: { ru: 'Логистика', en: 'Logistics' } },
  { id: 'jump_drive', name: { ru: 'Прыжковый двигатель', en: 'Jump Drive' } },
];

export async function seedResearchBranches() {
  console.log('Seeding research branches...');
  for (const row of researchData) {
    await db.insert(researchBranches).values(row).onConflictDoUpdate({
      target: researchBranches.id,
      set: row,
    });
  }
}
