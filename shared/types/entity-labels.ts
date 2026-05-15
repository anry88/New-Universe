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
  military_alloy: { en: 'Military Alloy', ru: 'Военный сплав' },
  military_composite: { en: 'Military Composite', ru: 'Военный композит' },
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
  military_shipyard: { en: 'Military Shipyard', ru: 'Военная верфь' },
};

export const SHIP_ENTITY_LABELS: Record<string, EntityLabels> = {
  scout: { en: 'Scout', ru: 'Разведчик' },
  cargo_light: { en: 'Lightweight Transporter', ru: 'Лёгкий транспорт' },
  cargo: { en: 'Cargo Transport', ru: 'Грузовой транспорт' },
  colonizer: { en: 'Colonizer', ru: 'Колонизатор' },
  recon_probe: { en: 'Recon Probe', ru: 'Разведывательный зонд' },
  refueler: { en: 'Refueler', ru: 'Заправщик' },
  fighter: { en: 'Fighter', ru: 'Истребитель' },
  light_fighter: { en: 'Light Fighter', ru: 'Лёгкий истребитель' },
  light_bomber: { en: 'Light Bomber', ru: 'Лёгкий бомбардировщик' },
  light_laser: { en: 'Light Laser Ship', ru: 'Лёгкий лазерный корабль' },
  cruiser: { en: 'Cruiser', ru: 'Крейсер' },
  battleship: { en: 'Battleship', ru: 'Линкор' },
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
