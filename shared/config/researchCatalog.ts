/**
 * Canonical research tech tree (7 branches × 5 tiers = 35 nodes).
 *
 * Economics curve (P2.1-417):
 * - Between tier **1→2**, total `Σ cost` and `timeSec` scale by **≥ 2.0×** (early onboarding).
 * - Between tiers **2→3→4→5**, scale by **≥ 2.5×** each step — materially steeper than a flat ×2 ladder.
 *
 * Applied gameplay modifiers (`effects[].multiplier`) are **tier totals per branch** (the runtime effects
 * engine applies only the highest completed tier for that branch).
 */
import type { ResearchDefinition, ResourceId } from '../types/research.js';

export type ResearchEffectTarget =
  | 'resourceProduction'
  | 'resourceStorage'
  | 'energyGeneration'
  | 'energyStorage'
  | 'energyEfficiency'
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
  levels: [
    ResearchLevelCatalogEntry,
    ResearchLevelCatalogEntry,
    ResearchLevelCatalogEntry,
    ResearchLevelCatalogEntry,
    ResearchLevelCatalogEntry,
  ];
}

type Cost = Partial<Record<ResourceId, number>>;

function mkLevel(
  branch: string,
  level: 1 | 2 | 3 | 4 | 5,
  name: { ru: string; en: string },
  description: { ru: string; en: string },
  cost: Cost,
  timeSec: number,
  effects: ResearchLevelCatalogEntry['effects'],
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
      mkLevel('mining', 3, { ru: 'Добыча III', en: 'Mining III' }, { ru: '+15% к добыче ресурсов', en: '+15% resource production' }, { iron: 700, silicon: 350 }, 525, [{ target: 'resourceProduction', multiplier: 1.15 }]),
      mkLevel('mining', 4, { ru: 'Добыча IV', en: 'Mining IV' }, { ru: '+20% к добыче ресурсов', en: '+20% resource production' }, { iron: 1750, silicon: 875 }, 1313, [{ target: 'resourceProduction', multiplier: 1.2 }]),
      mkLevel('mining', 5, { ru: 'Добыча V', en: 'Mining V' }, { ru: '+28% к добыче ресурсов', en: '+28% resource production' }, { iron: 4375, silicon: 2187 }, 3280, [{ target: 'resourceProduction', multiplier: 1.28 }]),
    ],
  },
  {
    branch: 'engineering',
    branchName: { ru: 'Инженерия', en: 'Engineering' },
    branchDescription: { ru: 'Оптимизация строительных процессов.', en: 'Optimizes construction workflows.' },
    levels: [
      mkLevel('engineering', 1, { ru: 'Инженерия I', en: 'Engineering I' }, { ru: '-3% ко времени строительства', en: '-3% build time' }, { iron: 150, silicon: 70 }, 120, [{ target: 'buildTime', multiplier: 0.97 }]),
      mkLevel('engineering', 2, { ru: 'Инженерия II', en: 'Engineering II' }, { ru: '-6% ко времени строительства', en: '-6% build time' }, { iron: 340, silicon: 160 }, 270, [{ target: 'buildTime', multiplier: 0.94 }]),
      mkLevel('engineering', 3, { ru: 'Инженерия III', en: 'Engineering III' }, { ru: '-9% ко времени строительства', en: '-9% build time' }, { iron: 830, silicon: 420 }, 675, [{ target: 'buildTime', multiplier: 0.91 }]),
      mkLevel('engineering', 4, { ru: 'Инженерия IV', en: 'Engineering IV' }, { ru: '-12% ко времени строительства', en: '-12% build time' }, { iron: 2085, silicon: 1040 }, 1687, [{ target: 'buildTime', multiplier: 0.88 }]),
      mkLevel('engineering', 5, { ru: 'Инженерия V', en: 'Engineering V' }, { ru: '-15% ко времени строительства', en: '-15% build time' }, { iron: 5212, silicon: 2600 }, 4218, [{ target: 'buildTime', multiplier: 0.85 }]),
    ],
  },
  {
    branch: 'engines',
    branchName: { ru: 'Двигатели', en: 'Engines' },
    branchDescription: { ru: 'Улучшение тяги и скорости кораблей.', en: 'Improves thrust and ship speed.' },
    levels: [
      mkLevel('engines', 1, { ru: 'Двигатели I', en: 'Engines I' }, { ru: '+5% к скорости кораблей', en: '+5% ship speed' }, { iron: 220, silicon: 110 }, 150, [{ target: 'shipSpeed', multiplier: 1.05 }]),
      mkLevel('engines', 2, { ru: 'Двигатели II', en: 'Engines II' }, { ru: '+10% к скорости кораблей', en: '+10% ship speed' }, { iron: 460, silicon: 230 }, 330, [{ target: 'shipSpeed', multiplier: 1.1 }]),
      mkLevel('engines', 3, { ru: 'Двигатели III', en: 'Engines III' }, { ru: '+15% к скорости кораблей', en: '+15% ship speed' }, { iron: 1150, silicon: 575 }, 825, [{ target: 'shipSpeed', multiplier: 1.15 }]),
      mkLevel('engines', 4, { ru: 'Двигатели IV', en: 'Engines IV' }, { ru: '+20% к скорости кораблей', en: '+20% ship speed' }, { iron: 2875, silicon: 1437 }, 2062, [{ target: 'shipSpeed', multiplier: 1.2 }]),
      mkLevel('engines', 5, { ru: 'Двигатели V', en: 'Engines V' }, { ru: '+28% к скорости кораблей', en: '+28% ship speed' }, { iron: 7187, silicon: 3593 }, 5155, [{ target: 'shipSpeed', multiplier: 1.28 }]),
    ],
  },
  {
    branch: 'energy',
    branchName: { ru: 'Энергетика', en: 'Energy' },
    branchDescription: {
      ru: 'Развитие генерации, хранения и потерь энергии.',
      en: 'Improves generation, storage, and energy losses.',
    },
    levels: [
      mkLevel(
        'energy',
        1,
        { ru: 'Энергетика I', en: 'Energy I' },
        {
          ru: 'Открывает ветротурбины и повышает выработку энергии на 8%',
          en: 'Unlocks wind turbines and increases energy generation by 8%',
        },
        { iron: 260, silicon: 130 },
        180,
        [{ target: 'energyGeneration', multiplier: 1.08 }],
      ),
      mkLevel(
        'energy',
        2,
        { ru: 'Энергетика II', en: 'Energy II' },
        {
          ru: 'Открывает топливные генераторы и повышает ёмкость аккумуляторов на 15%',
          en: 'Unlocks fuel generators and increases battery capacity by 15%',
        },
        { iron: 520, silicon: 260 },
        390,
        [
          { target: 'energyGeneration', multiplier: 1.12 },
          { target: 'energyStorage', multiplier: 1.15 },
        ],
      ),
      mkLevel(
        'energy',
        3,
        { ru: 'Энергетика III', en: 'Energy III' },
        {
          ru: 'Улучшает силовые шины: +18% выработки, +25% ёмкости, -8% энергозатрат',
          en: 'Improves power buses: +18% generation, +25% storage, -8% energy demand',
        },
        { iron: 1300, silicon: 650 },
        975,
        [
          { target: 'energyGeneration', multiplier: 1.18 },
          { target: 'energyStorage', multiplier: 1.25 },
          { target: 'energyEfficiency', multiplier: 0.92 },
        ],
      ),
      mkLevel(
        'energy',
        4,
        { ru: 'Энергетика IV', en: 'Energy IV' },
        {
          ru: 'Снижает потери сети: +24% выработки, +35% ёмкости, -13% энергозатрат',
          en: 'Reduces grid losses: +24% generation, +35% storage, -13% energy demand',
        },
        { iron: 3250, silicon: 1625 },
        2437,
        [
          { target: 'energyGeneration', multiplier: 1.24 },
          { target: 'energyStorage', multiplier: 1.35 },
          { target: 'energyEfficiency', multiplier: 0.87 },
        ],
      ),
      mkLevel(
        'energy',
        5,
        { ru: 'Энергетика V', en: 'Energy V' },
        {
          ru: 'Оптимизирует энергосеть колонии: +32% выработки, +50% ёмкости, -18% энергозатрат',
          en: 'Optimizes the colony grid: +32% generation, +50% storage, -18% energy demand',
        },
        { iron: 8125, silicon: 4062 },
        6093,
        [
          { target: 'energyGeneration', multiplier: 1.32 },
          { target: 'energyStorage', multiplier: 1.5 },
          { target: 'energyEfficiency', multiplier: 0.82 },
        ],
      ),
    ],
  },
  {
    branch: 'sensors',
    branchName: { ru: 'Сенсоры', en: 'Sensors' },
    branchDescription: { ru: 'Расширение радиуса обнаружения.', en: 'Extends exploration sensor range.' },
    levels: [
      mkLevel('sensors', 1, { ru: 'Сенсоры I', en: 'Sensors I' }, { ru: '+6% к радиусу сенсоров', en: '+6% sensor range' }, { iron: 120, silicon: 220 }, 150, [{ target: 'sensorRange', multiplier: 1.06 }]),
      mkLevel('sensors', 2, { ru: 'Сенсоры II', en: 'Sensors II' }, { ru: '+12% к радиусу сенсоров', en: '+12% sensor range' }, { iron: 260, silicon: 460 }, 330, [{ target: 'sensorRange', multiplier: 1.12 }]),
      mkLevel('sensors', 3, { ru: 'Сенсоры III', en: 'Sensors III' }, { ru: '+18% к радиусу сенсоров', en: '+18% sensor range' }, { iron: 600, silicon: 1200 }, 825, [{ target: 'sensorRange', multiplier: 1.18 }]),
      mkLevel('sensors', 4, { ru: 'Сенсоры IV', en: 'Sensors IV' }, { ru: '+24% к радиусу сенсоров', en: '+24% sensor range' }, { iron: 1500, silicon: 3000 }, 2062, [{ target: 'sensorRange', multiplier: 1.24 }]),
      mkLevel('sensors', 5, { ru: 'Сенсоры V', en: 'Sensors V' }, { ru: '+30% к радиусу сенсоров', en: '+30% sensor range' }, { iron: 3750, silicon: 7500 }, 5155, [{ target: 'sensorRange', multiplier: 1.3 }]),
    ],
  },
  {
    branch: 'logistics',
    branchName: { ru: 'Логистика', en: 'Logistics' },
    branchDescription: { ru: 'Повышение вместимости складов.', en: 'Improves storage and handling throughput.' },
    levels: [
      mkLevel('logistics', 1, { ru: 'Логистика I', en: 'Logistics I' }, { ru: '+8% к вместимости', en: '+8% storage capacity' }, { iron: 200, silicon: 180 }, 210, [{ target: 'resourceStorage', multiplier: 1.08 }]),
      mkLevel('logistics', 2, { ru: 'Логистика II', en: 'Logistics II' }, { ru: '+16% к вместимости', en: '+16% storage capacity' }, { iron: 430, silicon: 380 }, 450, [{ target: 'resourceStorage', multiplier: 1.16 }]),
      mkLevel('logistics', 3, { ru: 'Логистика III', en: 'Logistics III' }, { ru: '+24% к вместимости', en: '+24% storage capacity' }, { iron: 1012, silicon: 1013 }, 1125, [{ target: 'resourceStorage', multiplier: 1.24 }]),
      mkLevel('logistics', 4, { ru: 'Логистика IV', en: 'Logistics IV' }, { ru: '+32% к вместимости', en: '+32% storage capacity' }, { iron: 2531, silicon: 2531 }, 2812, [{ target: 'resourceStorage', multiplier: 1.32 }]),
      mkLevel('logistics', 5, { ru: 'Логистика V', en: 'Logistics V' }, { ru: '+40% к вместимости', en: '+40% storage capacity' }, { iron: 6327, silicon: 6328 }, 7030, [{ target: 'resourceStorage', multiplier: 1.4 }]),
    ],
  },
  {
    branch: 'jump_drive',
    branchName: { ru: 'Прыжковый двигатель', en: 'Jump Drive' },
    branchDescription: { ru: 'Технологии межсекторного перемещения.', en: 'Inter-sector mobility technology.' },
    levels: [
      mkLevel('jump_drive', 1, { ru: 'Прыжок I', en: 'Jump Drive I' }, { ru: '+2% к скорости кораблей', en: '+2% ship speed' }, { iron: 900, silicon: 900, tritium: 400 }, 720, [{ target: 'shipSpeed', multiplier: 1.02 }]),
      mkLevel('jump_drive', 2, { ru: 'Прыжок II', en: 'Jump Drive II' }, { ru: '+4% к скорости кораблей', en: '+4% ship speed' }, { iron: 2250, silicon: 2250, tritium: 1125 }, 1800, [{ target: 'shipSpeed', multiplier: 1.04 }]),
      mkLevel('jump_drive', 3, { ru: 'Прыжок III', en: 'Jump Drive III' }, { ru: '+6% к скорости кораблей', en: '+6% ship speed' }, { iron: 5625, silicon: 5625, tritium: 2812 }, 4500, [{ target: 'shipSpeed', multiplier: 1.06 }]),
      mkLevel('jump_drive', 4, { ru: 'Прыжок IV', en: 'Jump Drive IV' }, { ru: '+8% к скорости кораблей', en: '+8% ship speed' }, { iron: 14062, silicon: 14062, tritium: 7031 }, 11250, [{ target: 'shipSpeed', multiplier: 1.08 }]),
      mkLevel('jump_drive', 5, { ru: 'Прыжок V', en: 'Jump Drive V' }, { ru: '+10% к скорости кораблей', en: '+10% ship speed' }, { iron: 35155, silicon: 35155, tritium: 17577 }, 28125, [{ target: 'shipSpeed', multiplier: 1.1 }]),
    ],
  },
];

export const RESEARCH_TECH_TREE: ResearchLevelCatalogEntry[] = RESEARCH_CATALOG.flatMap((branch) => branch.levels);
