import type { ResearchDefinition } from '@shared/types/research';

/** Mirrors `backend/src/config/research-catalog.ts` (levels 1–3 per branch). */
export type ResearchEffectTarget =
  | 'resourceProduction'
  | 'resourceStorage'
  | 'shipSpeed'
  | 'sensorRange'
  | 'buildTime';

export interface TechTreeEntry extends ResearchDefinition {
  effects: Array<{ target: ResearchEffectTarget; multiplier: number }>;
}

export const RESEARCH_MAX_LEVEL = 3;

function mk(
  branch: string,
  level: 1 | 2 | 3,
  name: { ru: string; en: string },
  description: { ru: string; en: string },
  cost: TechTreeEntry['cost'],
  timeSec: number,
  effects: TechTreeEntry['effects'],
): TechTreeEntry {
  return {
    branch,
    level,
    name,
    description,
    cost,
    timeSec,
    requirements: {
      buildings: [{ typeId: 'lab', level }],
      research: level === 1 ? undefined : [{ branch, level: level - 1 }],
    },
    effects,
  };
}

export const TECH_TREE_DATA: TechTreeEntry[] = [
  mk('mining', 1, { ru: 'Добыча I', en: 'Mining I' }, { ru: '+5% к добыче ресурсов', en: '+5% resource production' }, { iron: 120, silicon: 60 }, 90, [
    { target: 'resourceProduction', multiplier: 1.05 },
  ]),
  mk('mining', 2, { ru: 'Добыча II', en: 'Mining II' }, { ru: '+10% к добыче ресурсов', en: '+10% resource production' }, { iron: 280, silicon: 140 }, 210, [
    { target: 'resourceProduction', multiplier: 1.1 },
  ]),
  mk('mining', 3, { ru: 'Добыча III', en: 'Mining III' }, { ru: '+15% к добыче ресурсов', en: '+15% resource production' }, { iron: 520, silicon: 260 }, 420, [
    { target: 'resourceProduction', multiplier: 1.15 },
  ]),

  mk('engineering', 1, { ru: 'Инженерия I', en: 'Engineering I' }, { ru: '-3% ко времени строительства', en: '-3% build time' }, { iron: 150, silicon: 70 }, 120, [
    { target: 'buildTime', multiplier: 0.97 },
  ]),
  mk('engineering', 2, { ru: 'Инженерия II', en: 'Engineering II' }, { ru: '-6% ко времени строительства', en: '-6% build time' }, { iron: 340, silicon: 160 }, 270, [
    { target: 'buildTime', multiplier: 0.94 },
  ]),
  mk('engineering', 3, { ru: 'Инженерия III', en: 'Engineering III' }, { ru: '-9% ко времени строительства', en: '-9% build time' }, { iron: 620, silicon: 300 }, 540, [
    { target: 'buildTime', multiplier: 0.91 },
  ]),

  mk('engines', 1, { ru: 'Двигатели I', en: 'Engines I' }, { ru: '+5% к скорости кораблей', en: '+5% ship speed' }, { iron: 220, silicon: 110 }, 150, [{ target: 'shipSpeed', multiplier: 1.05 }]),
  mk('engines', 2, { ru: 'Двигатели II', en: 'Engines II' }, { ru: '+10% к скорости кораблей', en: '+10% ship speed' }, { iron: 460, silicon: 230 }, 330, [{ target: 'shipSpeed', multiplier: 1.1 }]),
  mk('engines', 3, { ru: 'Двигатели III', en: 'Engines III' }, { ru: '+15% к скорости кораблей', en: '+15% ship speed' }, { iron: 820, silicon: 410 }, 660, [{ target: 'shipSpeed', multiplier: 1.15 }]),

  mk('weapons', 1, { ru: 'Вооружение I', en: 'Weapons I' }, { ru: 'Базовая подготовка вооружений', en: 'Base weapon systems training' }, { iron: 260, silicon: 130 }, 180, []),
  mk('weapons', 2, { ru: 'Вооружение II', en: 'Weapons II' }, { ru: 'Средний уровень вооружений', en: 'Intermediate weapon systems' }, { iron: 520, silicon: 260 }, 390, []),
  mk('weapons', 3, { ru: 'Вооружение III', en: 'Weapons III' }, { ru: 'Продвинутый уровень вооружений', en: 'Advanced weapon systems' }, { iron: 920, silicon: 460 }, 780, []),

  mk('sensors', 1, { ru: 'Сенсоры I', en: 'Sensors I' }, { ru: '+6% к радиусу сенсоров', en: '+6% sensor range' }, { iron: 120, silicon: 220 }, 150, [{ target: 'sensorRange', multiplier: 1.06 }]),
  mk('sensors', 2, { ru: 'Сенсоры II', en: 'Sensors II' }, { ru: '+12% к радиусу сенсоров', en: '+12% sensor range' }, { iron: 260, silicon: 460 }, 330, [{ target: 'sensorRange', multiplier: 1.12 }]),
  mk('sensors', 3, { ru: 'Сенсоры III', en: 'Sensors III' }, { ru: '+18% к радиусу сенсоров', en: '+18% sensor range' }, { iron: 470, silicon: 820 }, 660, [{ target: 'sensorRange', multiplier: 1.18 }]),

  mk('logistics', 1, { ru: 'Логистика I', en: 'Logistics I' }, { ru: '+8% к вместимости', en: '+8% storage capacity' }, { iron: 200, silicon: 180 }, 210, [{ target: 'resourceStorage', multiplier: 1.08 }]),
  mk('logistics', 2, { ru: 'Логистика II', en: 'Logistics II' }, { ru: '+16% к вместимости', en: '+16% storage capacity' }, { iron: 430, silicon: 380 }, 450, [{ target: 'resourceStorage', multiplier: 1.16 }]),
  mk('logistics', 3, { ru: 'Логистика III', en: 'Logistics III' }, { ru: '+24% к вместимости', en: '+24% storage capacity' }, { iron: 760, silicon: 700 }, 900, [{ target: 'resourceStorage', multiplier: 1.24 }]),

  mk('jump_drive', 1, { ru: 'Прыжок I', en: 'Jump Drive I' }, { ru: '+2% к скорости кораблей', en: '+2% ship speed' }, { iron: 900, silicon: 900, tritium: 400 }, 720, [{ target: 'shipSpeed', multiplier: 1.02 }]),
  mk('jump_drive', 2, { ru: 'Прыжок II', en: 'Jump Drive II' }, { ru: '+4% к скорости кораблей', en: '+4% ship speed' }, { iron: 1500, silicon: 1500, tritium: 700 }, 1500, [{ target: 'shipSpeed', multiplier: 1.04 }]),
  mk('jump_drive', 3, { ru: 'Прыжок III', en: 'Jump Drive III' }, { ru: '+6% к скорости кораблей', en: '+6% ship speed' }, { iron: 2400, silicon: 2400, tritium: 1100 }, 3000, [{ target: 'shipSpeed', multiplier: 1.06 }]),
];

export const BRANCHES = [
  { id: 'mining', name: { ru: 'Добыча ресурсов', en: 'Resource Mining' }, description: { ru: 'Повышение эффективности добычи.', en: 'Improves extraction throughput.' } },
  { id: 'engineering', name: { ru: 'Инженерия', en: 'Engineering' }, description: { ru: 'Оптимизация строительных процессов.', en: 'Optimizes construction workflows.' } },
  { id: 'engines', name: { ru: 'Двигатели', en: 'Engines' }, description: { ru: 'Улучшение тяги и скорости кораблей.', en: 'Improves thrust and ship speed.' } },
  { id: 'weapons', name: { ru: 'Вооружение', en: 'Weapons' }, description: { ru: 'Подготовка ветки боевых технологий.', en: 'Prepares combat technology progression.' } },
  { id: 'sensors', name: { ru: 'Сенсоры', en: 'Sensors' }, description: { ru: 'Расширение радиуса обнаружения.', en: 'Extends exploration sensor range.' } },
  { id: 'logistics', name: { ru: 'Логистика', en: 'Logistics' }, description: { ru: 'Повышение вместимости складов.', en: 'Improves storage and handling throughput.' } },
  { id: 'jump_drive', name: { ru: 'Прыжковый двигатель', en: 'Jump Drive' }, description: { ru: 'Технологии межсекторного перемещения.', en: 'Inter-sector mobility technology.' } },
];
