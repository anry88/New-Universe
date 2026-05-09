import { ResearchDefinition } from '@shared/types/research.js';

export const TECH_TREE: ResearchDefinition[] = [
  // Mining
  { branch: 'mining', level: 1, name: { ru: 'Добыча I', en: 'Mining I' }, description: { ru: 'Базовые технологии добычи', en: 'Basic mining tech' }, cost: { iron: 100, silicon: 50 }, timeSec: 60, requirements: { buildings: [{ typeId: 'lab', level: 1 }] } },
  { branch: 'mining', level: 2, name: { ru: 'Добыча II', en: 'Mining II' }, description: { ru: 'Улучшенные буры', en: 'Improved drills' }, cost: { iron: 500, silicon: 250 }, timeSec: 300, requirements: { research: [{ branch: 'mining', level: 1 }], buildings: [{ typeId: 'lab', level: 2 }] } },
  
  // Engineering
  { branch: 'engineering', level: 1, name: { ru: 'Инженерия I', en: 'Engineering I' }, description: { ru: 'Основы конструкции', en: 'Construction basics' }, cost: { iron: 150, silicon: 50 }, timeSec: 90, requirements: { buildings: [{ typeId: 'lab', level: 1 }] } },
  
  // Engines
  { branch: 'engines', level: 1, name: { ru: 'Двигатели I', en: 'Engines I' }, description: { ru: 'Реактивная тяга', en: 'Jet propulsion' }, cost: { iron: 200, silicon: 100 }, timeSec: 120, requirements: { buildings: [{ typeId: 'lab', level: 2 }] } },
  
  // Weapons
  { branch: 'weapons', level: 1, name: { ru: 'Вооружение I', en: 'Weapons I' }, description: { ru: 'Лазерные пушки', en: 'Laser cannons' }, cost: { iron: 300, silicon: 150 }, timeSec: 180, requirements: { buildings: [{ typeId: 'lab', level: 3 }] } },
  
  // Sensors
  { branch: 'sensors', level: 1, name: { ru: 'Сенсоры I', en: 'Sensors I' }, description: { ru: 'Радары ближнего действия', en: 'Short-range radars' }, cost: { iron: 100, silicon: 200 }, timeSec: 150, requirements: { buildings: [{ typeId: 'lab', level: 2 }] } },
  
  // Logistics
  { branch: 'logistics', level: 1, name: { ru: 'Логистика I', en: 'Logistics I' }, description: { ru: 'Оптимизация складов', en: 'Warehouse optimization' }, cost: { iron: 200, silicon: 200 }, timeSec: 240, requirements: { buildings: [{ typeId: 'lab', level: 2 }] } },
  
  // Jump Drive
  { branch: 'jump_drive', level: 1, name: { ru: 'Прыжок I', en: 'Jump I' }, description: { ru: 'Межзвездные прыжки', en: 'Interstellar jumps' }, cost: { iron: 1000, silicon: 1000, tritium: 500 }, timeSec: 600, requirements: { research: [{ branch: 'engines', level: 3 }], buildings: [{ typeId: 'lab', level: 5 }] } },
];

// Helper to get research by branch and level
export function getResearchDef(branch: string, level: number): ResearchDefinition | undefined {
  return TECH_TREE.find(r => r.branch === branch && r.level === level);
}
