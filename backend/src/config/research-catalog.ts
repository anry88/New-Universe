import type { ResearchDefinition, ResourceId } from '@shared/types/research.js';

export type ResearchEffectTarget =
  | 'resourceProduction'
  | 'resourceStorage'
  | 'shipSpeed'
  | 'sensorRange'
  | 'buildTime';

export interface ResearchLevelCatalogEntry extends ResearchDefinition {
  effects: Array<{
    target: ResearchEffectTarget;
    multiplier: number;
  }>;
}

export interface ResearchBranchCatalog {
  branch: string;
  branchName: { ru: string; en: string };
  branchDescription: { ru: string; en: string };
  levels: [ResearchLevelCatalogEntry, ResearchLevelCatalogEntry, ResearchLevelCatalogEntry];
}

type Cost = Partial<Record<ResourceId, number>>;

function mkLevel(
  branch: string,
  level: 1 | 2 | 3,
  name: { ru: string; en: string },
  description: { ru: string; en: string },
  cost: Cost,
  timeSec: number,
  effects: ResearchLevelCatalogEntry['effects']
): ResearchLevelCatalogEntry {
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

export const RESEARCH_CATALOG: ResearchBranchCatalog[] = [
  {
    branch: 'mining',
    branchName: { ru: 'Добыча ресурсов', en: 'Resource Mining' },
    branchDescription: { ru: 'Повышение эффективности добычи.', en: 'Improves extraction throughput.' },
    levels: [
      mkLevel('mining', 1, { ru: 'Добыча I', en: 'Mining I' }, { ru: '+5% к добыче ресурсов', en: '+5% resource production' }, { iron: 120, silicon: 60 }, 90, [{ target: 'resourceProduction', multiplier: 1.05 }]),
      mkLevel('mining', 2, { ru: 'Добыча II', en: 'Mining II' }, { ru: '+10% к добыче ресурсов', en: '+10% resource production' }, { iron: 280, silicon: 140 }, 210, [{ target: 'resourceProduction', multiplier: 1.1 }]),
      mkLevel('mining', 3, { ru: 'Добыча III', en: 'Mining III' }, { ru: '+15% к добыче ресурсов', en: '+15% resource production' }, { iron: 520, silicon: 260 }, 420, [{ target: 'resourceProduction', multiplier: 1.15 }]),
    ],
  },
  {
    branch: 'engineering',
    branchName: { ru: 'Инженерия', en: 'Engineering' },
    branchDescription: { ru: 'Оптимизация строительных процессов.', en: 'Optimizes construction workflows.' },
    levels: [
      mkLevel('engineering', 1, { ru: 'Инженерия I', en: 'Engineering I' }, { ru: '-3% ко времени строительства', en: '-3% build time' }, { iron: 150, silicon: 70 }, 120, [{ target: 'buildTime', multiplier: 0.97 }]),
      mkLevel('engineering', 2, { ru: 'Инженерия II', en: 'Engineering II' }, { ru: '-6% ко времени строительства', en: '-6% build time' }, { iron: 340, silicon: 160 }, 270, [{ target: 'buildTime', multiplier: 0.94 }]),
      mkLevel('engineering', 3, { ru: 'Инженерия III', en: 'Engineering III' }, { ru: '-9% ко времени строительства', en: '-9% build time' }, { iron: 620, silicon: 300 }, 540, [{ target: 'buildTime', multiplier: 0.91 }]),
    ],
  },
  {
    branch: 'engines',
    branchName: { ru: 'Двигатели', en: 'Engines' },
    branchDescription: { ru: 'Улучшение тяги и скорости кораблей.', en: 'Improves thrust and ship speed.' },
    levels: [
      mkLevel('engines', 1, { ru: 'Двигатели I', en: 'Engines I' }, { ru: '+5% к скорости кораблей', en: '+5% ship speed' }, { iron: 220, silicon: 110 }, 150, [{ target: 'shipSpeed', multiplier: 1.05 }]),
      mkLevel('engines', 2, { ru: 'Двигатели II', en: 'Engines II' }, { ru: '+10% к скорости кораблей', en: '+10% ship speed' }, { iron: 460, silicon: 230 }, 330, [{ target: 'shipSpeed', multiplier: 1.1 }]),
      mkLevel('engines', 3, { ru: 'Двигатели III', en: 'Engines III' }, { ru: '+15% к скорости кораблей', en: '+15% ship speed' }, { iron: 820, silicon: 410 }, 660, [{ target: 'shipSpeed', multiplier: 1.15 }]),
    ],
  },
  {
    branch: 'weapons',
    branchName: { ru: 'Вооружение', en: 'Weapons' },
    branchDescription: { ru: 'Подготовка ветки боевых технологий.', en: 'Prepares combat technology progression.' },
    levels: [
      mkLevel('weapons', 1, { ru: 'Вооружение I', en: 'Weapons I' }, { ru: 'Базовая подготовка вооружений', en: 'Base weapon systems training' }, { iron: 260, silicon: 130 }, 180, []),
      mkLevel('weapons', 2, { ru: 'Вооружение II', en: 'Weapons II' }, { ru: 'Средний уровень вооружений', en: 'Intermediate weapon systems' }, { iron: 520, silicon: 260 }, 390, []),
      mkLevel('weapons', 3, { ru: 'Вооружение III', en: 'Weapons III' }, { ru: 'Продвинутый уровень вооружений', en: 'Advanced weapon systems' }, { iron: 920, silicon: 460 }, 780, []),
    ],
  },
  {
    branch: 'sensors',
    branchName: { ru: 'Сенсоры', en: 'Sensors' },
    branchDescription: { ru: 'Расширение радиуса обнаружения.', en: 'Extends exploration sensor range.' },
    levels: [
      mkLevel('sensors', 1, { ru: 'Сенсоры I', en: 'Sensors I' }, { ru: '+6% к радиусу сенсоров', en: '+6% sensor range' }, { iron: 120, silicon: 220 }, 150, [{ target: 'sensorRange', multiplier: 1.06 }]),
      mkLevel('sensors', 2, { ru: 'Сенсоры II', en: 'Sensors II' }, { ru: '+12% к радиусу сенсоров', en: '+12% sensor range' }, { iron: 260, silicon: 460 }, 330, [{ target: 'sensorRange', multiplier: 1.12 }]),
      mkLevel('sensors', 3, { ru: 'Сенсоры III', en: 'Sensors III' }, { ru: '+18% к радиусу сенсоров', en: '+18% sensor range' }, { iron: 470, silicon: 820 }, 660, [{ target: 'sensorRange', multiplier: 1.18 }]),
    ],
  },
  {
    branch: 'logistics',
    branchName: { ru: 'Логистика', en: 'Logistics' },
    branchDescription: { ru: 'Повышение вместимости складов.', en: 'Improves storage and handling throughput.' },
    levels: [
      mkLevel('logistics', 1, { ru: 'Логистика I', en: 'Logistics I' }, { ru: '+8% к вместимости', en: '+8% storage capacity' }, { iron: 200, silicon: 180 }, 210, [{ target: 'resourceStorage', multiplier: 1.08 }]),
      mkLevel('logistics', 2, { ru: 'Логистика II', en: 'Logistics II' }, { ru: '+16% к вместимости', en: '+16% storage capacity' }, { iron: 430, silicon: 380 }, 450, [{ target: 'resourceStorage', multiplier: 1.16 }]),
      mkLevel('logistics', 3, { ru: 'Логистика III', en: 'Logistics III' }, { ru: '+24% к вместимости', en: '+24% storage capacity' }, { iron: 760, silicon: 700 }, 900, [{ target: 'resourceStorage', multiplier: 1.24 }]),
    ],
  },
  {
    branch: 'jump_drive',
    branchName: { ru: 'Прыжковый двигатель', en: 'Jump Drive' },
    branchDescription: { ru: 'Технологии межсекторного перемещения.', en: 'Inter-sector mobility technology.' },
    levels: [
      mkLevel('jump_drive', 1, { ru: 'Прыжок I', en: 'Jump Drive I' }, { ru: '+2% к скорости кораблей', en: '+2% ship speed' }, { iron: 900, silicon: 900, tritium: 400 }, 720, [{ target: 'shipSpeed', multiplier: 1.02 }]),
      mkLevel('jump_drive', 2, { ru: 'Прыжок II', en: 'Jump Drive II' }, { ru: '+4% к скорости кораблей', en: '+4% ship speed' }, { iron: 1500, silicon: 1500, tritium: 700 }, 1500, [{ target: 'shipSpeed', multiplier: 1.04 }]),
      mkLevel('jump_drive', 3, { ru: 'Прыжок III', en: 'Jump Drive III' }, { ru: '+6% к скорости кораблей', en: '+6% ship speed' }, { iron: 2400, silicon: 2400, tritium: 1100 }, 3000, [{ target: 'shipSpeed', multiplier: 1.06 }]),
    ],
  },
];

export const RESEARCH_TECH_TREE: ResearchLevelCatalogEntry[] = RESEARCH_CATALOG.flatMap((branch) => branch.levels);
