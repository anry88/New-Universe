/**
 * Canonical research tech tree (8 branches × 5 tiers = 40 nodes).
 *
 * Economics curve (P2.1-417 / P2.2-007):
 * - Between tier **1→2**, total `Σ cost` and `timeSec` scale by **≥ 2.0×** (early onboarding).
 * - Between tiers **2→3→4→5**, scale by **≥ 2.5×** each step — materially steeper than a flat ×2 ladder.
 * - Base timer bands are now minute/hour-scale (not seconds-scale) so one active research slot feels
 *   meaningful: core branches start at 10–15 minutes and finish at 24–36 hours; Jump Drive reaches 72h.
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
  | 'weaponRange'
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

const MINUTE = 60;
const HOUR = 60 * MINUTE;

const RESEARCH_TIME_CURVES = {
  core: [10 * MINUTE, 30 * MINUTE, 2 * HOUR, 8 * HOUR, 24 * HOUR],
  infrastructure: [12 * MINUTE, 40 * MINUTE, 3 * HOUR, 10 * HOUR, 30 * HOUR],
  logistics: [15 * MINUTE, 45 * MINUTE, 3 * HOUR, 12 * HOUR, 36 * HOUR],
  jump: [1 * HOUR, 3 * HOUR, 9 * HOUR, 27 * HOUR, 72 * HOUR],
} satisfies Record<string, [number, number, number, number, number]>;

function researchTime(
  curve: keyof typeof RESEARCH_TIME_CURVES,
  level: 1 | 2 | 3 | 4 | 5,
): number {
  return RESEARCH_TIME_CURVES[curve][level - 1];
}

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
      mkLevel('mining', 1, { ru: 'Добыча I', en: 'Mining I' }, { ru: '+5% к добыче ресурсов', en: '+5% resource production' }, { iron: 120, silicon: 60 }, researchTime('core', 1), [{ target: 'resourceProduction', multiplier: 1.05 }]),
      mkLevel('mining', 2, { ru: 'Добыча II', en: 'Mining II' }, { ru: '+10% к добыче ресурсов', en: '+10% resource production' }, { iron: 280, silicon: 140 }, researchTime('core', 2), [{ target: 'resourceProduction', multiplier: 1.1 }]),
      mkLevel('mining', 3, { ru: 'Добыча III', en: 'Mining III' }, { ru: '+15% к добыче ресурсов', en: '+15% resource production' }, { iron: 700, silicon: 350 }, researchTime('core', 3), [{ target: 'resourceProduction', multiplier: 1.15 }]),
      mkLevel('mining', 4, { ru: 'Добыча IV', en: 'Mining IV' }, { ru: '+20% к добыче ресурсов', en: '+20% resource production' }, { iron: 1750, silicon: 875 }, researchTime('core', 4), [{ target: 'resourceProduction', multiplier: 1.2 }]),
      mkLevel('mining', 5, { ru: 'Добыча V', en: 'Mining V' }, { ru: '+28% к добыче ресурсов', en: '+28% resource production' }, { iron: 4375, silicon: 2187 }, researchTime('core', 5), [{ target: 'resourceProduction', multiplier: 1.28 }]),
    ],
  },
  {
    branch: 'engineering',
    branchName: { ru: 'Инженерия', en: 'Engineering' },
    branchDescription: { ru: 'Оптимизация строительных процессов.', en: 'Optimizes construction workflows.' },
    levels: [
      mkLevel('engineering', 1, { ru: 'Инженерия I', en: 'Engineering I' }, { ru: '-3% ко времени строительства', en: '-3% build time' }, { iron: 150, silicon: 70 }, researchTime('core', 1), [{ target: 'buildTime', multiplier: 0.97 }]),
      mkLevel('engineering', 2, { ru: 'Инженерия II', en: 'Engineering II' }, { ru: '-6% ко времени строительства', en: '-6% build time' }, { iron: 340, silicon: 160 }, researchTime('core', 2), [{ target: 'buildTime', multiplier: 0.94 }]),
      mkLevel('engineering', 3, { ru: 'Инженерия III', en: 'Engineering III' }, { ru: '-9% ко времени строительства', en: '-9% build time' }, { iron: 830, silicon: 420 }, researchTime('core', 3), [{ target: 'buildTime', multiplier: 0.91 }]),
      mkLevel('engineering', 4, { ru: 'Инженерия IV', en: 'Engineering IV' }, { ru: '-12% ко времени строительства', en: '-12% build time' }, { iron: 2085, silicon: 1040 }, researchTime('core', 4), [{ target: 'buildTime', multiplier: 0.88 }]),
      mkLevel('engineering', 5, { ru: 'Инженерия V', en: 'Engineering V' }, { ru: '-15% ко времени строительства', en: '-15% build time' }, { iron: 5212, silicon: 2600 }, researchTime('core', 5), [{ target: 'buildTime', multiplier: 0.85 }]),
    ],
  },
  {
    branch: 'engines',
    branchName: { ru: 'Двигатели', en: 'Engines' },
    branchDescription: { ru: 'Улучшение тяги и скорости кораблей.', en: 'Improves thrust and ship speed.' },
    levels: [
      mkLevel('engines', 1, { ru: 'Двигатели I', en: 'Engines I' }, { ru: '+5% к скорости кораблей', en: '+5% ship speed' }, { iron: 220, silicon: 110 }, researchTime('infrastructure', 1), [{ target: 'shipSpeed', multiplier: 1.05 }]),
      mkLevel('engines', 2, { ru: 'Двигатели II', en: 'Engines II' }, { ru: '+10% к скорости кораблей', en: '+10% ship speed' }, { iron: 460, silicon: 230 }, researchTime('infrastructure', 2), [{ target: 'shipSpeed', multiplier: 1.1 }]),
      mkLevel('engines', 3, { ru: 'Двигатели III', en: 'Engines III' }, { ru: '+15% к скорости кораблей', en: '+15% ship speed' }, { iron: 1150, silicon: 575 }, researchTime('infrastructure', 3), [{ target: 'shipSpeed', multiplier: 1.15 }]),
      mkLevel('engines', 4, { ru: 'Двигатели IV', en: 'Engines IV' }, { ru: '+20% к скорости кораблей', en: '+20% ship speed' }, { iron: 2875, silicon: 1437 }, researchTime('infrastructure', 4), [{ target: 'shipSpeed', multiplier: 1.2 }]),
      mkLevel('engines', 5, { ru: 'Двигатели V', en: 'Engines V' }, { ru: '+28% к скорости кораблей', en: '+28% ship speed' }, { iron: 7187, silicon: 3593 }, researchTime('infrastructure', 5), [{ target: 'shipSpeed', multiplier: 1.28 }]),
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
        researchTime('infrastructure', 1),
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
        researchTime('infrastructure', 2),
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
        researchTime('infrastructure', 3),
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
        researchTime('infrastructure', 4),
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
        researchTime('infrastructure', 5),
        [
          { target: 'energyGeneration', multiplier: 1.32 },
          { target: 'energyStorage', multiplier: 1.5 },
          { target: 'energyEfficiency', multiplier: 0.82 },
        ],
      ),
    ],
  },
  {
    branch: 'weapons',
    branchName: { ru: 'Вооружение', en: 'Weapons' },
    branchDescription: { ru: 'Подготовка к боевым технологиям.', en: 'Prepares combat technology progression.' },
    levels: [
      mkLevel(
        'weapons',
        1,
        { ru: 'Вооружение I', en: 'Weapons I' },
        {
          ru: 'Базовая подготовка вооружений: +6% к дальности оружия',
          en: 'Basic weapons training: +6% weapon range',
        },
        { iron: 260, silicon: 130 },
        researchTime('core', 1),
        [{ target: 'weaponRange', multiplier: 1.06 }],
      ),
      mkLevel(
        'weapons',
        2,
        { ru: 'Вооружение II', en: 'Weapons II' },
        {
          ru: 'Средняя подготовка вооружений: +12% к дальности оружия',
          en: 'Intermediate combat systems training: +12% weapon range',
        },
        { iron: 520, silicon: 260 },
        researchTime('core', 2),
        [{ target: 'weaponRange', multiplier: 1.12 }],
      ),
      mkLevel(
        'weapons',
        3,
        { ru: 'Вооружение III', en: 'Weapons III' },
        {
          ru: 'Продвинутая подготовка вооружений: +18% к дальности оружия',
          en: 'Advanced combat systems training: +18% weapon range',
        },
        { iron: 1300, silicon: 650 },
        researchTime('core', 3),
        [{ target: 'weaponRange', multiplier: 1.18 }],
      ),
      mkLevel(
        'weapons',
        4,
        { ru: 'Вооружение IV', en: 'Weapons IV' },
        {
          ru: 'Экспертная подготовка вооружений: +24% к дальности оружия',
          en: 'Expert combat systems training: +24% weapon range',
        },
        { iron: 3250, silicon: 1625 },
        researchTime('core', 4),
        [{ target: 'weaponRange', multiplier: 1.24 }],
      ),
      mkLevel(
        'weapons',
        5,
        { ru: 'Вооружение V', en: 'Weapons V' },
        {
          ru: 'Мастерство вооружений: +30% к дальности оружия',
          en: 'Mastery of combat systems: +30% weapon range',
        },
        { iron: 8125, silicon: 4062, gold: 200 },
        researchTime('core', 5),
        [{ target: 'weaponRange', multiplier: 1.3 }],
      ),
    ],
  },
  {
    branch: 'sensors',
    branchName: { ru: 'Сенсоры', en: 'Sensors' },
    branchDescription: { ru: 'Расширение радиуса обнаружения.', en: 'Extends exploration sensor range.' },
    levels: [
      mkLevel('sensors', 1, { ru: 'Сенсоры I', en: 'Sensors I' }, { ru: '+6% к радиусу сенсоров', en: '+6% sensor range' }, { iron: 120, silicon: 220 }, researchTime('infrastructure', 1), [{ target: 'sensorRange', multiplier: 1.06 }]),
      mkLevel('sensors', 2, { ru: 'Сенсоры II', en: 'Sensors II' }, { ru: '+12% к радиусу сенсоров', en: '+12% sensor range' }, { iron: 260, silicon: 460 }, researchTime('infrastructure', 2), [{ target: 'sensorRange', multiplier: 1.12 }]),
      mkLevel('sensors', 3, { ru: 'Сенсоры III', en: 'Sensors III' }, { ru: '+18% к радиусу сенсоров', en: '+18% sensor range' }, { iron: 600, silicon: 1200 }, researchTime('infrastructure', 3), [{ target: 'sensorRange', multiplier: 1.18 }]),
      mkLevel('sensors', 4, { ru: 'Сенсоры IV', en: 'Sensors IV' }, { ru: '+24% к радиусу сенсоров', en: '+24% sensor range' }, { iron: 1500, silicon: 3000 }, researchTime('infrastructure', 4), [{ target: 'sensorRange', multiplier: 1.24 }]),
      mkLevel('sensors', 5, { ru: 'Сенсоры V', en: 'Sensors V' }, { ru: '+30% к радиусу сенсоров', en: '+30% sensor range' }, { iron: 3750, silicon: 7500 }, researchTime('infrastructure', 5), [{ target: 'sensorRange', multiplier: 1.3 }]),
    ],
  },
  {
    branch: 'logistics',
    branchName: { ru: 'Логистика', en: 'Logistics' },
    branchDescription: { ru: 'Повышение вместимости складов и лимита колоний.', en: 'Improves storage, handling throughput, and colony capacity.' },
    levels: [
      mkLevel('logistics', 1, { ru: 'Логистика I', en: 'Logistics I' }, { ru: '+8% к вместимости, +5 к лимиту колоний', en: '+8% storage capacity, +5 colony slots' }, { iron: 200, silicon: 180 }, researchTime('logistics', 1), [{ target: 'resourceStorage', multiplier: 1.08 }]),
      mkLevel('logistics', 2, { ru: 'Логистика II', en: 'Logistics II' }, { ru: '+16% к вместимости, +5 к лимиту колоний', en: '+16% storage capacity, +5 colony slots' }, { iron: 430, silicon: 380 }, researchTime('logistics', 2), [{ target: 'resourceStorage', multiplier: 1.16 }]),
      mkLevel('logistics', 3, { ru: 'Логистика III', en: 'Logistics III' }, { ru: '+24% к вместимости, +5 к лимиту колоний', en: '+24% storage capacity, +5 colony slots' }, { iron: 1012, silicon: 1013 }, researchTime('logistics', 3), [{ target: 'resourceStorage', multiplier: 1.24 }]),
      mkLevel('logistics', 4, { ru: 'Логистика IV', en: 'Logistics IV' }, { ru: '+32% к вместимости, +5 к лимиту колоний', en: '+32% storage capacity, +5 colony slots' }, { iron: 2531, silicon: 2531 }, researchTime('logistics', 4), [{ target: 'resourceStorage', multiplier: 1.32 }]),
      mkLevel('logistics', 5, { ru: 'Логистика V', en: 'Logistics V' }, { ru: '+40% к вместимости, +5 к лимиту колоний', en: '+40% storage capacity, +5 colony slots' }, { iron: 6327, silicon: 6328 }, researchTime('logistics', 5), [{ target: 'resourceStorage', multiplier: 1.4 }]),
    ],
  },
  {
    branch: 'jump_drive',
    branchName: { ru: 'Прыжковый двигатель', en: 'Jump Drive' },
    branchDescription: { ru: 'Технологии межсекторного перемещения.', en: 'Inter-sector mobility technology.' },
    levels: [
      mkLevel('jump_drive', 1, { ru: 'Прыжок I', en: 'Jump Drive I' }, { ru: '+2% к скорости кораблей', en: '+2% ship speed' }, { iron: 900, silicon: 900, tritium: 400 }, researchTime('jump', 1), [{ target: 'shipSpeed', multiplier: 1.02 }]),
      mkLevel('jump_drive', 2, { ru: 'Прыжок II', en: 'Jump Drive II' }, { ru: '+4% к скорости кораблей', en: '+4% ship speed' }, { iron: 2250, silicon: 2250, tritium: 1125 }, researchTime('jump', 2), [{ target: 'shipSpeed', multiplier: 1.04 }]),
      mkLevel('jump_drive', 3, { ru: 'Прыжок III', en: 'Jump Drive III' }, { ru: '+6% к скорости кораблей', en: '+6% ship speed' }, { iron: 5625, silicon: 5625, tritium: 2812 }, researchTime('jump', 3), [{ target: 'shipSpeed', multiplier: 1.06 }]),
      mkLevel('jump_drive', 4, { ru: 'Прыжок IV', en: 'Jump Drive IV' }, { ru: '+8% к скорости кораблей', en: '+8% ship speed' }, { iron: 14062, silicon: 14062, tritium: 7031 }, researchTime('jump', 4), [{ target: 'shipSpeed', multiplier: 1.08 }]),
      mkLevel('jump_drive', 5, { ru: 'Прыжок V', en: 'Jump Drive V' }, { ru: '+10% к скорости кораблей', en: '+10% ship speed' }, { iron: 35155, silicon: 35155, tritium: 17577 }, researchTime('jump', 5), [{ target: 'shipSpeed', multiplier: 1.1 }]),
    ],
  },
];

export const RESEARCH_TECH_TREE: ResearchLevelCatalogEntry[] = RESEARCH_CATALOG.flatMap((branch) => branch.levels);
