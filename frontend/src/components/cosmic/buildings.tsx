/**
 * New Universe — Cosmic Atlas building icons.
 * Ported from `design-bundle/project/art.jsx`. All icons share a 64×64 viewBox,
 * thin 1.5px strokes, two-tone fills tinted by `tone`.
 *
 * The set covers the 10 building types defined in the backend catalog
 * (`backend/src/db/seed/building-types.ts`). Aliases are provided for the
 * legacy frontend ids (`research_lab`, `power_plant`) so screens that still
 * reference the old names keep rendering until they are migrated.
 */
import React from 'react';

export type BuildingTypeId =
  | 'command_center'
  | 'mine'
  | 'drill'
  | 'storage'
  | 'smelter'
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
  cat: string;
}

export const BUILDING_BY_TYPE: Record<BuildingTypeId, BuildingDef> = {
  command_center: { Icon: IconCommandCenter, label: 'Command Center', cat: 'Core' },
  mine: { Icon: IconMine, label: 'Mine', cat: 'Extraction' },
  drill: { Icon: IconDrill, label: 'Deep Drill', cat: 'Extraction' },
  storage: { Icon: IconStorage, label: 'Storage', cat: 'Logistics' },
  smelter: { Icon: IconSmelter, label: 'Smelter', cat: 'Production' },
  spaceport: { Icon: IconSpaceport, label: 'Spaceport', cat: 'Fleet' },
  shipyard: { Icon: IconShipyard, label: 'Shipyard', cat: 'Fleet' },
  lab: { Icon: IconLab, label: 'Research Lab', cat: 'Science' },
  cryo_factory: { Icon: IconCryoFactory, label: 'Cryo Factory', cat: 'Production' },
  solar_plant: { Icon: IconSolarPlant, label: 'Solar Plant', cat: 'Energy' },
};

/**
 * Map any backend building type id (including legacy frontend aliases) to a
 * known catalog entry. Falls back to the Mine icon for safety.
 */
export function resolveBuildingType(typeId: string | undefined | null): BuildingDef {
  const v = (typeId || '').toLowerCase();
  if (v in BUILDING_BY_TYPE) return BUILDING_BY_TYPE[v as BuildingTypeId];
  // Aliases for legacy / synonym ids in the codebase.
  if (v === 'research_lab' || v === 'laboratory') return BUILDING_BY_TYPE.lab;
  if (v === 'power_plant' || v === 'energy_plant' || v === 'solar') return BUILDING_BY_TYPE.solar_plant;
  if (v === 'depot' || v === 'warehouse') return BUILDING_BY_TYPE.storage;
  if (v === 'factory') return BUILDING_BY_TYPE.smelter;
  return BUILDING_BY_TYPE.mine;
}

export interface BuildingIconByTypeProps extends BuildingIconProps {
  typeId: string;
}

export const BuildingIcon: React.FC<BuildingIconByTypeProps> = ({ typeId, size, tone }) => {
  const def = resolveBuildingType(typeId);
  const Cmp = def.Icon;
  return <Cmp size={size} tone={tone} />;
};
