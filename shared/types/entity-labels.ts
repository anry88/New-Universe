import type { Locale } from './locale.js';

type EntityLabels = Record<Locale, string>;

export const RESOURCE_ENTITY_LABELS: Record<string, EntityLabels> = {
  energy: { en: 'Energy', ru: 'Энергия' },
  water: { en: 'Water', ru: 'Вода' },
  iron: { en: 'Iron', ru: 'Железо' },
  carbon: { en: 'Carbon', ru: 'Углерод' },
  silicon: { en: 'Silicon', ru: 'Кремний' },
  methane: { en: 'Methane', ru: 'Метан' },
  oxygen: { en: 'Oxygen', ru: 'Кислород' },
  hydrogen: { en: 'Hydrogen', ru: 'Водород' },
  fuel: { en: 'Fuel', ru: 'Топливо' },
  jump_fuel: { en: 'Jump Fuel', ru: 'Прыжковое топливо' },
  copper: { en: 'Copper', ru: 'Медь' },
  aluminum: { en: 'Aluminum', ru: 'Алюминий' },
  silver: { en: 'Silver', ru: 'Серебро' },
  titanium: { en: 'Titanium', ru: 'Титан' },
  ice: { en: 'Ice', ru: 'Лёд' },
  oil: { en: 'Oil', ru: 'Нефть' },
  sulfur: { en: 'Sulfur', ru: 'Сера' },
  steel: { en: 'Steel', ru: 'Сталь' },
  electronics: { en: 'Electronics', ru: 'Электроника' },
  mercury: { en: 'Mercury', ru: 'Ртуть' },
  magnesium: { en: 'Magnesium', ru: 'Магний' },
  lead: { en: 'Lead', ru: 'Свинец' },
  nitrogen: { en: 'Nitrogen', ru: 'Азот' },
  uranium: { en: 'Uranium', ru: 'Уран' },
  cobalt: { en: 'Cobalt', ru: 'Кобальт' },
  silicon_carbide: { en: 'Silicon Carbide', ru: 'Карбид кремния' },
  tritium: { en: 'Tritium', ru: 'Тритий' },
  gold: { en: 'Gold', ru: 'Золото' },
  antimatter: { en: 'Antimatter', ru: 'Антиматерия' },
  iridium: { en: 'Iridium', ru: 'Иридий' },
  biomass: { en: 'Biomass', ru: 'Биомасса' },
  metal: { en: 'metal', ru: 'металлы' },
  solid_mineral: { en: 'solid mineral', ru: 'твёрдых минералов' },
  gas: { en: 'gas', ru: 'газ' },
  oil_or_methane: { en: 'Oil or Methane', ru: 'Нефть или метан' },
  water_or_biomass: { en: 'Water or Biomass', ru: 'Вода или биомасса' },
  liquid_nitrogen: { en: 'Liquid Nitrogen', ru: 'Жидкий азот' },
  military_alloy: { en: 'Silver Steel', ru: 'Серебряная сталь' },
  military_composite: { en: 'C/SiC Composite', ru: 'C/SiC-композит' },
};

export const BUILDING_ENTITY_LABELS: Record<string, EntityLabels> = {
  command_center: { en: 'Command Center', ru: 'Командный центр' },
  mine: { en: 'Mine', ru: 'Шахта' },
  drill: { en: 'Gas Extractor', ru: 'Газовый экстрактор' },
  battery: { en: 'Battery', ru: 'Аккумулятор' },
  storage: { en: 'Storage', ru: 'Склад' },
  oil_pump: { en: 'Oil Pump', ru: 'Нефтекачка' },
  biomass_harvester: { en: 'Bioreactor', ru: 'Биореактор' },
  smelter: { en: 'Smelter', ru: 'Завод' },
  refinery: { en: 'Refinery', ru: 'Нефтеперерабатывающий завод' },
  fabrication_bay: { en: 'Fabrication Bay', ru: 'Цех электроники' },
  spaceport: { en: 'Spaceport', ru: 'Космопорт' },
  shipyard: { en: 'Shipyard', ru: 'Верфь' },
  lab: { en: 'Laboratory', ru: 'Лаборатория' },
  cryo_factory: { en: 'Cryo Factory', ru: 'Криогенный завод' },
  solar_plant: { en: 'Solar Plant', ru: 'Солнечная станция' },
  wind_turbine: { en: 'Wind Turbine', ru: 'Ветротурбина' },
  fuel_generator: { en: 'Fuel Generator', ru: 'Топливный генератор' },
  atomic_reactor: { en: 'Atomic Reactor', ru: 'Атомный реактор' },
  military_shipyard: { en: 'Military Shipyard', ru: 'Военная верфь' },
};

export const SHIP_ENTITY_LABELS: Record<string, EntityLabels> = {
  scout: { en: 'Scout', ru: 'Разведчик' },
  cargo_light: { en: 'Lightweight Transporter', ru: 'Лёгкий транспорт' },
  cargo: { en: 'Cargo Transport', ru: 'Грузовой транспорт' },
  colonizer: { en: 'Colonizer', ru: 'Колонизатор' },
  recon_probe: { en: 'Recon Probe', ru: 'Разведывательный зонд' },
  refueler: { en: 'Refueler', ru: 'Заправщик' },
  light_fighter: { en: 'Light Fighter', ru: 'Лёгкий истребитель' },
  light_bomber: { en: 'Light Bomber', ru: 'Лёгкий бомбардировщик' },
  light_laser: { en: 'Light Laser Ship', ru: 'Лёгкий лазерный корабль' },
  small_shield_ship: { en: 'Small Shield Ship', ru: 'Малый щитовой корабль' },
  medium_fighter: { en: 'Medium Fighter', ru: 'Средний истребитель' },
  medium_bomber: { en: 'Medium Bomber', ru: 'Средний бомбардировщик' },
  medium_laser: { en: 'Medium Laser Ship', ru: 'Средний лазерный корабль' },
  medium_shield_ship: { en: 'Medium Shield Ship', ru: 'Средний щитовой корабль' },
  heavy_fighter: { en: 'Heavy Fighter', ru: 'Тяжёлый истребитель' },
  heavy_bomber: { en: 'Heavy Bomber', ru: 'Тяжёлый бомбардировщик' },
  heavy_laser: { en: 'Heavy Laser Ship', ru: 'Тяжёлый лазерный корабль' },
  large_shield_ship: { en: 'Large Shield Ship', ru: 'Большой щитовой корабль' },
  rocket_carrier: { en: 'Rocket Carrier', ru: 'Ракетный носитель' },
  heavy_rocket_carrier: { en: 'Heavy Rocket Carrier', ru: 'Тяжёлый ракетный носитель' },
  nuclear_carrier: { en: 'Nuclear Carrier', ru: 'Ядерный носитель' },
};

export const SHIP_ENTITY_DESCRIPTIONS: Record<string, EntityLabels> = {
  scout: {
    en: 'Fast survey hull for local routes and early discovery.',
    ru: 'Быстрый разведывательный корпус для локальных маршрутов и ранних открытий.',
  },
  cargo_light: {
    en: 'Light logistics hauler for moving resources between owned settlements.',
    ru: 'Лёгкий логистический транспорт для перевозки ресурсов между вашими поселениями.',
  },
  cargo: {
    en: 'Cargo transport for resource logistics.',
    ru: 'Грузовой транспорт для ресурсной логистики.',
  },
  colonizer: {
    en: 'Settlement hull that founds a new colony on an eligible discovered planet.',
    ru: 'Колонизационный корпус для основания поселения на подходящей открытой планете.',
  },
  recon_probe: {
    en: 'One-use probe for opening a new Jump Gate destination.',
    ru: 'Одноразовый зонд для открытия нового направления через Прыжковые врата.',
  },
  refueler: {
    en: 'Support tanker that transfers ordinary and Jump Fuel to idle ships.',
    ru: 'Корабль поддержки, передающий обычное и прыжковое топливо свободным кораблям.',
  },
  light_fighter: {
    en: 'Fast close-range interceptor that counters heavier payload carriers with evasion.',
    ru: 'Быстрый ближний перехватчик, который уклонением сдерживает носители тяжёлых зарядов.',
  },
  light_bomber: {
    en: 'Light orbital striker for slowly breaking hostile surface structures.',
    ru: 'Лёгкий орбитальный ударный корабль для постепенного подавления вражеских построек.',
  },
  light_laser: {
    en: 'Long-range light beam ship with strong armor penetration.',
    ru: 'Лёгкий дальнобойный лучевой корабль с высоким пробитием брони.',
  },
  small_shield_ship: {
    en: 'Compact defensive hull that projects a short-range shield over nearby allied ships.',
    ru: 'Компактный оборонительный корпус с ближним щитовым полем для соседних союзных кораблей.',
  },
  medium_fighter: {
    en: 'Up-armored fighter line that trades speed for stronger sustained damage.',
    ru: 'Усиленная линия истребителей: меньше скорости, больше устойчивого урона.',
  },
  medium_bomber: {
    en: 'Heavier orbital striker for fortified hostile colonies.',
    ru: 'Более тяжёлый орбитальный ударный корабль против укреплённых вражеских колоний.',
  },
  medium_laser: {
    en: 'Common Pool laser hull using advanced cooling and components for long-range pressure.',
    ru: 'Лазерный корпус Common Pool с продвинутым охлаждением и компонентами для дальнего давления.',
  },
  medium_shield_ship: {
    en: 'Fleet defender with a wider recoverable shield field for grouped formations.',
    ru: 'Флотский защитник с расширенным восстанавливаемым щитовым полем для групповых построений.',
  },
  heavy_fighter: {
    en: 'Heavy interceptor built from advanced alloys for line-breaking ship combat.',
    ru: 'Тяжёлый перехватчик из продвинутых сплавов для прорыва боевой линии.',
  },
  heavy_bomber: {
    en: 'Slow high-durability bomber for late fortified targets.',
    ru: 'Медленный прочный бомбардировщик против поздних укреплённых целей.',
  },
  heavy_laser: {
    en: 'Late laser hull with rare components and high armor penetration.',
    ru: 'Поздний лазерный корпус с редкими компонентами и высоким пробитием брони.',
  },
  large_shield_ship: {
    en: 'Heavy defensive platform that covers wide allied formations with a deep shield reserve.',
    ru: 'Тяжёлая оборонительная платформа с широким щитовым покрытием и большим запасом прочности.',
  },
  rocket_carrier: {
    en: 'Long-range payload carrier that pressures medium and heavy ships but struggles against light evasive hulls.',
    ru: 'Дальнобойный носитель зарядов против средних и тяжёлых кораблей, уязвимый к лёгким манёвренным корпусам.',
  },
  heavy_rocket_carrier: {
    en: 'Heavy payload carrier with stronger bursts, high cost, and the same light-hull counterplay.',
    ru: 'Тяжёлый носитель зарядов с мощными залпами, высокой ценой и тем же контрплеем лёгких корпусов.',
  },
  nuclear_carrier: {
    en: 'Late-tier strike ship that strikes hostile heavies with nuclear missiles and drops orbital nuclear bombs on enemy colonies.',
    ru: 'Поздний ударный корабль: бьёт тяжёлые вражеские корпуса ядерными ракетами и проводит орбитальную ядерную бомбардировку вражеских колоний.',
  },
};

export function humanizeEntityId(entityId: string | null | undefined): string {
  const normalized = (entityId ?? '').trim();
  if (!normalized) return 'Unknown';
  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function labelFor(
  labelsById: Record<string, EntityLabels>,
  entityId: string | null | undefined,
  locale: Locale,
): string {
  const id = (entityId ?? '').toLowerCase();
  return labelsById[id]?.[locale] ?? humanizeEntityId(entityId);
}

export function resourceLabel(resourceId: string | null | undefined, locale: Locale = 'en'): string {
  return labelFor(RESOURCE_ENTITY_LABELS, resourceId, locale);
}

export function buildingLabel(typeId: string | null | undefined, locale: Locale = 'en'): string {
  return labelFor(BUILDING_ENTITY_LABELS, typeId, locale);
}

export function shipLabel(typeId: string | null | undefined, locale: Locale = 'en'): string {
  return labelFor(SHIP_ENTITY_LABELS, typeId, locale);
}

export function shipDescription(typeId: string | null | undefined, locale: Locale = 'en'): string {
  return labelFor(SHIP_ENTITY_DESCRIPTIONS, typeId, locale);
}

export function formatEntityList(
  entityIds: readonly string[] | undefined,
  labeler: (entityId: string, locale: Locale) => string,
  locale: Locale = 'en',
): string {
  const labels = [...new Set(entityIds ?? [])].map((entityId) => labeler(entityId, locale));
  return labels.join(locale === 'ru' ? ', ' : ', ');
}

export function formatInsufficientResourceMessage(
  resourceId: string,
  locale: Locale = 'en',
): string {
  const label = resourceLabel(resourceId, locale);
  return locale === 'ru'
    ? `Не хватает ресурса: ${label}.`
    : `not enough ${label.toLowerCase()}.`;
}
