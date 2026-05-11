/**
 * New Universe — Cosmic Atlas building icons.
 * Ported from `design-bundle/project/art.jsx`. All icons share a 64×64 viewBox,
 * thin 1.5px strokes, two-tone fills tinted by `tone`.
 *
 * The set covers the building types defined in the backend catalog
 * (`backend/src/db/seed/building-types.ts`). Aliases map older payload spellings
 * (e.g. hyphenated lab ids, `laboratory`, legacy energy plant names) so mixed
 * API versions still resolve to catalog entries.
 */
import React from 'react';
import type { Locale } from '@shared/types/locale';

export type BuildingTypeId =
  | 'command_center'
  | 'mine'
  | 'drill'
  | 'storage'
  | 'oil_pump'
  | 'smelter'
  | 'refinery'
  | 'fabrication_bay'
  | 'spaceport'
  | 'shipyard'
  | 'lab'
  | 'cryo_factory'
  | 'solar_plant';

export interface BuildingIconProps {
  size?: number;
  tone?: string;
}

const Icon: React.FC<BuildingIconProps & { children: React.ReactNode }> = ({
  size = 36,
  tone = '#5BD7FF',
  children,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    stroke={tone}
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

export const IconCommandCenter: React.FC<BuildingIconProps> = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <path d="M16 48 L32 16 L48 48 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.12" />
    <path d="M22 48 L32 28 L42 48" />
    <circle cx="32" cy="14" r="2.6" fill={tone ?? '#5BD7FF'} />
    <path d="M32 16 L32 11" />
    <path d="M14 52 L50 52" />
    <circle cx="32" cy="40" r="2" fill={tone ?? '#5BD7FF'} />
  </Icon>
);

export const IconMine: React.FC<BuildingIconProps> = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <path d="M14 40 L32 18 L50 40 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.1" />
    <path d="M22 40 L32 28 L42 40" />
    <path d="M10 50 L54 50" />
    <path d="M20 50 L24 40" />
    <path d="M44 50 L40 40" />
    <circle cx="32" cy="44" r="1.8" fill={tone ?? '#5BD7FF'} />
  </Icon>
);

export const IconDrill: React.FC<BuildingIconProps> = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <path d="M26 10 L38 10 L36 22 L28 22 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.15" />
    <path d="M28 22 L36 22 L34 32 L30 32 Z" />
    <path d="M30 32 L34 32 L33 40 L31 40 Z" />
    <path d="M31 40 L33 40 L32 50 Z" />
    <path d="M14 18 L26 18" />
    <path d="M38 18 L50 18" />
    <path d="M14 12 L14 24" />
    <path d="M50 12 L50 24" />
  </Icon>
);

export const IconStorage: React.FC<BuildingIconProps> = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <rect x="10" y="36" width="44" height="16" rx="1" fill={tone ?? '#5BD7FF'} fillOpacity="0.12" />
    <rect x="10" y="20" width="44" height="16" rx="1" />
    <path d="M18 20 L18 36" />
    <path d="M32 20 L32 36" />
    <path d="M46 20 L46 36" />
    <path d="M18 36 L18 52" />
    <path d="M32 36 L32 52" />
    <path d="M46 36 L46 52" />
    <circle cx="14" cy="28" r="1.4" fill={tone ?? '#5BD7FF'} />
    <circle cx="14" cy="44" r="1.4" fill={tone ?? '#5BD7FF'} />
  </Icon>
);

export const IconOilPump: React.FC<BuildingIconProps> = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <path d="M18 50 L18 26 L24 20 L24 50 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.12" />
    <path d="M18 26 L34 20 L50 26" />
    <path d="M34 20 L34 50" />
    <path d="M24 32 L34 28 L44 32" />
    <path d="M44 32 L44 50" />
    <ellipse cx="34" cy="54" rx="10" ry="3" fill={tone ?? '#5BD7FF'} fillOpacity="0.3" />
  </Icon>
);

export const IconSmelter: React.FC<BuildingIconProps> = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <path d="M14 52 L14 28 L26 22 L26 52 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.12" />
    <rect x="28" y="18" width="22" height="34" rx="1" />
    <path d="M34 18 L34 8" />
    <path d="M44 18 L44 8" />
    <circle cx="34" cy="6" r="2" fill={tone ?? '#5BD7FF'} fillOpacity="0.5" />
    <circle cx="44" cy="6" r="2" fill={tone ?? '#5BD7FF'} fillOpacity="0.5" />
    <path d="M32 38 L46 38" />
    <circle cx="39" cy="44" r="3" fill={tone ?? '#5BD7FF'} fillOpacity="0.4" />
  </Icon>
);

export const IconRefinery: React.FC<BuildingIconProps> = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <rect x="12" y="24" width="18" height="28" rx="1" fill={tone ?? '#5BD7FF'} fillOpacity="0.12" />
    <rect x="34" y="18" width="18" height="34" rx="1" />
    <path d="M18 24 L18 10" />
    <path d="M24 24 L24 14" />
    <path d="M40 18 L40 8" />
    <path d="M46 18 L46 12" />
    <path d="M30 34 L34 34" />
    <path d="M20 44 L34 44" />
    <circle cx="42" cy="38" r="3" fill={tone ?? '#5BD7FF'} fillOpacity="0.4" />
  </Icon>
);

export const IconSpaceport: React.FC<BuildingIconProps> = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <path d="M32 8 L36 24 L36 42 L28 42 L28 24 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.18" />
    <path d="M28 24 L22 30 L22 42 L28 42" />
    <path d="M36 24 L42 30 L42 42 L36 42" />
    <circle cx="32" cy="22" r="1.8" fill={tone ?? '#5BD7FF'} />
    <path d="M14 52 L50 52" />
    <path d="M28 42 L20 52" />
    <path d="M36 42 L44 52" />
  </Icon>
);

export const IconShipyard: React.FC<BuildingIconProps> = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <path d="M10 38 L54 38 L48 48 L16 48 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.15" />
    <path d="M16 38 L16 28 L48 28 L48 38" />
    <path d="M22 28 L22 16 L42 16 L42 28" />
    <path d="M32 16 L32 10" />
    <circle cx="32" cy="9" r="1.4" fill={tone ?? '#5BD7FF'} />
    <path d="M6 38 L10 38" />
    <path d="M54 38 L58 38" />
  </Icon>
);

/**
 * Fabrication bay — electronics workshop. Stylized as a clean-room building
 * with a chip motif (squared antenna pins on a die).
 */
export const IconFabricationBay: React.FC<BuildingIconProps> = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <rect x="12" y="22" width="40" height="28" rx="1" fill={tone ?? '#5BD7FF'} fillOpacity="0.12" />
    <rect x="22" y="30" width="20" height="14" rx="1" />
    <path d="M22 34 L18 34" />
    <path d="M22 40 L18 40" />
    <path d="M42 34 L46 34" />
    <path d="M42 40 L46 40" />
    <path d="M28 30 L28 26" />
    <path d="M36 30 L36 26" />
    <path d="M28 44 L28 48" />
    <path d="M36 44 L36 48" />
    <circle cx="32" cy="37" r="1.6" fill={tone ?? '#5BD7FF'} />
    <path d="M12 22 L20 14 L44 14 L52 22" />
    <path d="M20 14 L20 22" />
    <path d="M44 14 L44 22" />
  </Icon>
);

export const IconLab: React.FC<BuildingIconProps> = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <path d="M26 10 L38 10" />
    <path d="M28 10 L28 26 L18 48 Q14 56 22 56 L42 56 Q50 56 46 48 L36 26 L36 10" />
    <path d="M22 40 Q32 36 42 40" fill={tone ?? '#5BD7FF'} fillOpacity="0.18" />
    <circle cx="28" cy="46" r="1.4" fill={tone ?? '#5BD7FF'} />
    <circle cx="36" cy="50" r="1.4" fill={tone ?? '#5BD7FF'} />
  </Icon>
);

export const IconCryoFactory: React.FC<BuildingIconProps> = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <circle cx="32" cy="32" r="18" fill={tone ?? '#5BD7FF'} fillOpacity="0.1" />
    <path d="M32 14 L32 50" />
    <path d="M14 32 L50 32" />
    <path d="M19 19 L45 45" />
    <path d="M45 19 L19 45" />
    <path d="M32 14 L29 18 M32 14 L35 18" />
    <path d="M32 50 L29 46 M32 50 L35 46" />
    <path d="M14 32 L18 29 M14 32 L18 35" />
    <path d="M50 32 L46 29 M50 32 L46 35" />
  </Icon>
);

export const IconSolarPlant: React.FC<BuildingIconProps> = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <circle cx="20" cy="22" r="6" fill={tone ?? '#5BD7FF'} fillOpacity="0.4" />
    <path d="M20 12 L20 8" />
    <path d="M20 32 L20 36" />
    <path d="M10 22 L6 22" />
    <path d="M30 22 L34 22" />
    <path d="M13 15 L10 12" />
    <path d="M27 29 L30 32" />
    <rect x="34" y="34" width="20" height="14" rx="1" fill={tone ?? '#5BD7FF'} fillOpacity="0.15" />
    <path d="M38 34 L38 48" />
    <path d="M44 34 L44 48" />
    <path d="M50 34 L50 48" />
    <path d="M30 52 L58 52" />
    <path d="M44 48 L44 52" />
  </Icon>
);

export interface BuildingDef {
  Icon: React.FC<BuildingIconProps>;
  label: string;
  labels: Record<Locale, string>;
  cat: string;
  cats: Record<Locale, string>;
}

export type BuildingCategoryKey =
  | 'energy'
  | 'extraction'
  | 'processing'
  | 'logistics'
  | 'shipbuilding'
  | 'progress'
  | 'special'
  | 'unknown';

export const BUILDING_CATEGORY_ORDER: BuildingCategoryKey[] = [
  'energy',
  'extraction',
  'processing',
  'logistics',
  'shipbuilding',
  'progress',
  'special',
  'unknown',
];

export const BUILDING_CATEGORY_LABELS: Record<BuildingCategoryKey, Record<Locale, string>> = {
  energy: { en: 'Energy', ru: 'Энергия' },
  extraction: { en: 'Extraction', ru: 'Добыча' },
  processing: { en: 'Processing', ru: 'Переработка' },
  logistics: { en: 'Logistics', ru: 'Логистика' },
  shipbuilding: { en: 'Shipbuilding', ru: 'Строительство кораблей' },
  progress: { en: 'Progress', ru: 'Прогресс' },
  special: { en: 'Special', ru: 'Особые' },
  unknown: { en: 'Unknown', ru: 'Неизвестно' },
};

const BUILDING_CATEGORY_BY_TYPE: Record<BuildingTypeId, BuildingCategoryKey> = {
  command_center: 'special',
  mine: 'extraction',
  drill: 'extraction',
  storage: 'logistics',
  oil_pump: 'extraction',
  smelter: 'processing',
  refinery: 'processing',
  fabrication_bay: 'processing',
  spaceport: 'shipbuilding',
  shipyard: 'shipbuilding',
  lab: 'progress',
  cryo_factory: 'special',
  solar_plant: 'energy',
};

export const BUILDING_BY_TYPE: Record<BuildingTypeId, BuildingDef> = {
  command_center: { Icon: IconCommandCenter, label: 'Command Center', labels: { en: 'Command Center', ru: 'Командный центр' }, cat: 'Special', cats: BUILDING_CATEGORY_LABELS.special },
  mine: { Icon: IconMine, label: 'Metals Mine', labels: { en: 'Metals Mine', ru: 'Шахта' }, cat: 'Extraction', cats: BUILDING_CATEGORY_LABELS.extraction },
  drill: { Icon: IconDrill, label: 'Fluid Extractor', labels: { en: 'Fluid Extractor', ru: 'Экстрактор' }, cat: 'Extraction', cats: BUILDING_CATEGORY_LABELS.extraction },
  storage: { Icon: IconStorage, label: 'Storage', labels: { en: 'Storage', ru: 'Склад' }, cat: 'Logistics', cats: BUILDING_CATEGORY_LABELS.logistics },
  oil_pump: { Icon: IconOilPump, label: 'Oil Pump', labels: { en: 'Oil Pump', ru: 'Нефтекачка' }, cat: 'Extraction', cats: BUILDING_CATEGORY_LABELS.extraction },
  smelter: { Icon: IconSmelter, label: 'Smelter', labels: { en: 'Smelter', ru: 'Завод' }, cat: 'Processing', cats: BUILDING_CATEGORY_LABELS.processing },
  refinery: { Icon: IconRefinery, label: 'Refinery', labels: { en: 'Refinery', ru: 'НПЗ' }, cat: 'Processing', cats: BUILDING_CATEGORY_LABELS.processing },
  fabrication_bay: { Icon: IconFabricationBay, label: 'Fabrication Bay', labels: { en: 'Fabrication Bay', ru: 'Цех электроники' }, cat: 'Processing', cats: BUILDING_CATEGORY_LABELS.processing },
  spaceport: { Icon: IconSpaceport, label: 'Spaceport', labels: { en: 'Spaceport', ru: 'Космопорт' }, cat: 'Shipbuilding', cats: BUILDING_CATEGORY_LABELS.shipbuilding },
  shipyard: { Icon: IconShipyard, label: 'Shipyard', labels: { en: 'Shipyard', ru: 'Верфь' }, cat: 'Shipbuilding', cats: BUILDING_CATEGORY_LABELS.shipbuilding },
  lab: { Icon: IconLab, label: 'Research Lab', labels: { en: 'Research Lab', ru: 'Лаборатория' }, cat: 'Progress', cats: BUILDING_CATEGORY_LABELS.progress },
  cryo_factory: { Icon: IconCryoFactory, label: 'Cryo Factory', labels: { en: 'Cryo Factory', ru: 'Криозавод' }, cat: 'Special', cats: BUILDING_CATEGORY_LABELS.special },
  solar_plant: { Icon: IconSolarPlant, label: 'Solar Plant', labels: { en: 'Solar Plant', ru: 'Солнечная станция' }, cat: 'Energy', cats: BUILDING_CATEGORY_LABELS.energy },
};

/**
 * Map any backend building type id (including legacy frontend aliases) to a
 * known catalog entry.
 *
 * IMPORTANT: never silently fall back to a real catalog entry like `mine` —
 * that was the source of a long-standing bug where fabrication_bay (and
 * any other un-registered building) rendered as a Mine in the UI. We now
 * return a placeholder definition that uses the storage icon and the raw
 * type id as label, so missing icons are visible at a glance instead of
 * masquerading as something else.
 */
export function resolveBuildingType(typeId: string | undefined | null): BuildingDef {
  const v = (typeId || '').toLowerCase();
  if (v in BUILDING_BY_TYPE) return BUILDING_BY_TYPE[v as BuildingTypeId];
  // Aliases for legacy / synonym ids.
  if (/^research[_-]?lab$/i.test(v) || v === 'laboratory') return BUILDING_BY_TYPE.lab;
  if (v === 'depot' || v === 'warehouse') return BUILDING_BY_TYPE.storage;
  if (v === 'factory' || v === 'electronics_factory') return BUILDING_BY_TYPE.fabrication_bay;
  if (typeof console !== 'undefined') {
    console.warn(`[buildings] unknown building typeId="${typeId}" — rendered as placeholder`);
  }
  return {
    Icon: IconStorage,
    label: typeId || 'Unknown',
    labels: { en: typeId || 'Unknown', ru: typeId || 'Неизвестно' },
    cat: 'Unknown',
    cats: { en: 'Unknown', ru: 'Неизвестно' },
  };
}

export function getBuildingLabel(typeId: string | undefined | null, locale: Locale = 'en'): string {
  return resolveBuildingType(typeId).labels[locale];
}

export function getBuildingCategory(typeId: string | undefined | null, locale: Locale = 'en'): string {
  return resolveBuildingType(typeId).cats[locale];
}

export function getBuildingCategoryKey(typeId: string | undefined | null): BuildingCategoryKey {
  const v = (typeId || '').toLowerCase();
  return v in BUILDING_CATEGORY_BY_TYPE ? BUILDING_CATEGORY_BY_TYPE[v as BuildingTypeId] : 'unknown';
}

export function getBuildingCategoryLabel(categoryKey: BuildingCategoryKey, locale: Locale = 'en'): string {
  return BUILDING_CATEGORY_LABELS[categoryKey][locale];
}

export interface BuildingIconByTypeProps extends BuildingIconProps {
  typeId: string;
}

export const BuildingIcon: React.FC<BuildingIconByTypeProps> = ({ typeId, size, tone }) => {
  const def = resolveBuildingType(typeId);
  const Cmp = def.Icon;
  return <Cmp size={size} tone={tone} />;
};
