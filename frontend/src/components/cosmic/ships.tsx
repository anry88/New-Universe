/**
 * New Universe — Cosmic Atlas ship icons.
 *
 * The map, fleet roster, shipyard planner, and mission dialogs all use this
 * resolver so hull visuals stay stable across screens. New ship catalog ids
 * should be added here instead of falling back to geometric markers.
 */
import React from 'react';
import type { Locale } from '@shared/types/locale';
import { shipLabel } from '@shared/types/entity-labels';

export interface ShipIconProps {
  size?: number;
  tone?: string;
}

export type ShipTypeId =
  | 'scout'
  | 'cargo_light'
  | 'cargo'
  | 'colonizer'
  | 'recon_probe'
  | 'refueler'
  | 'fighter'
  | 'light_fighter'
  | 'light_bomber'
  | 'light_laser'
  | 'medium_fighter'
  | 'medium_bomber'
  | 'medium_laser'
  | 'heavy_fighter'
  | 'heavy_bomber'
  | 'heavy_laser'
  | 'rocket_carrier'
  | 'heavy_rocket_carrier'
  | 'cruiser'
  | 'battleship';

export interface ShipDef {
  Icon: React.FC<ShipIconProps>;
  label: string;
  labels: Record<Locale, string>;
  tag: string;
  tags: Record<Locale, string>;
}

const HIDDEN_SHIP_TYPE_IDS = new Set<string>();

const HullIcon: React.FC<ShipIconProps & { children: React.ReactNode }> = ({
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
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const IconScout: React.FC<ShipIconProps> = ({ size, tone }) => (
  <HullIcon size={size} tone={tone}>
    <path d="M51 32 L18 15 L24 32 L18 49 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.14" />
    <path d="M25 26 L39 32 L25 38" />
    <circle cx="30" cy="32" r="3" fill={tone ?? '#5BD7FF'} fillOpacity="0.45" />
    <path d="M16 23 L9 18" />
    <path d="M16 41 L9 46" />
    <path d="M12 32 L4 32" />
  </HullIcon>
);

export const IconCargoLight: React.FC<ShipIconProps> = ({ size, tone }) => (
  <HullIcon size={size} tone={tone}>
    <path d="M11 25 L43 17 L54 32 L43 47 L11 39 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.12" />
    <rect x="15" y="25" width="22" height="14" rx="2" />
    <path d="M37 25 L48 32 L37 39" />
    <path d="M20 25 L20 39" />
    <path d="M28 25 L28 39" />
    <path d="M12 21 L7 16" />
    <path d="M12 43 L7 48" />
  </HullIcon>
);

export const IconColonizer: React.FC<ShipIconProps> = ({ size, tone }) => (
  <HullIcon size={size} tone={tone}>
    <path d="M48 32 L30 13 L17 32 L30 51 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.13" />
    <path d="M30 13 L34 32 L30 51" />
    <path d="M17 32 L48 32" />
    <circle cx="30" cy="32" r="7" fill={tone ?? '#5BD7FF'} fillOpacity="0.18" />
    <path d="M14 45 Q21 51 30 55 Q39 51 46 45" />
    <path d="M14 19 Q21 13 30 9 Q39 13 46 19" />
  </HullIcon>
);

export const IconReconProbe: React.FC<ShipIconProps> = ({ size, tone }) => (
  <HullIcon size={size} tone={tone}>
    <circle cx="32" cy="32" r="8" fill={tone ?? '#5BD7FF'} fillOpacity="0.18" />
    <circle cx="32" cy="32" r="18" strokeOpacity="0.55" />
    <path d="M32 8 L32 18" />
    <path d="M32 46 L32 56" />
    <path d="M8 32 L18 32" />
    <path d="M46 32 L56 32" />
    <path d="M44 20 L52 12" />
    <path d="M20 44 L12 52" />
  </HullIcon>
);

export const IconRefueler: React.FC<ShipIconProps> = ({ size, tone }) => (
  <HullIcon size={size} tone={tone}>
    <path d="M12 20 L48 20 L56 32 L48 44 L12 44 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.12" />
    <rect x="16" y="24" width="12" height="16" rx="1" />
    <rect x="32" y="24" width="12" height="16" rx="1" />
    <path d="M12 28 L4 28" />
    <path d="M12 36 L4 36" />
    <circle cx="22" cy="32" r="2" fill={tone ?? '#5BD7FF'} />
    <circle cx="38" cy="32" r="2" fill={tone ?? '#5BD7FF'} />
  </HullIcon>
);

export const IconUnknownShip: React.FC<ShipIconProps> = ({ size, tone }) => (
  <HullIcon size={size} tone={tone}>
    <circle cx="32" cy="32" r="19" fill={tone ?? '#5BD7FF'} fillOpacity="0.08" />
    <path d="M20 38 Q32 17 44 38" />
    <path d="M21 44 L43 44" />
    <circle cx="32" cy="34" r="2" fill={tone ?? '#5BD7FF'} />
  </HullIcon>
);

/** Light combat interceptor with angled wings and nose cannon */
export const IconFighter: React.FC<ShipIconProps> = ({ size, tone }) => (
  <HullIcon size={size} tone={tone}>
    <path d="M52 32 L22 14 L14 32 L22 50 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.16" />
    <path d="M22 14 L26 26 L26 38 L22 50" />
    <path d="M14 32 L8 32" />
    <path d="M52 32 L58 32" />
    <circle cx="36" cy="32" r="2" fill={tone ?? '#5BD7FF'} fillOpacity="0.5" />
    <path d="M22 14 L18 8" />
    <path d="M22 50 L18 56" />
  </HullIcon>
);

/** Light fighter — narrow dart hull with forward kinetic cannon */
export const IconLightFighter: React.FC<ShipIconProps> = ({ size, tone }) => (
  <HullIcon size={size} tone={tone}>
    <path d="M56 32 L20 18 L16 32 L20 46 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.15" />
    <path d="M20 18 L23 26 L23 38 L20 46" />
    <path d="M56 32 L62 32" />
    <circle cx="38" cy="32" r="2" fill={tone ?? '#5BD7FF'} fillOpacity="0.55" />
    <path d="M16 32 L8 32" />
    <path d="M20 20 L14 14" />
    <path d="M20 44 L14 50" />
  </HullIcon>
);

/** Light bomber — wide flat hull with orbital drop bay */
export const IconLightBomber: React.FC<ShipIconProps> = ({ size, tone }) => (
  <HullIcon size={size} tone={tone}>
    <path d="M46 32 L28 14 L10 20 L10 44 L28 50 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.13" />
    <path d="M10 20 L36 32 L10 44" />
    <rect x="24" y="27" width="14" height="10" rx="2" />
    <circle cx="31" cy="32" r="2" fill={tone ?? '#5BD7FF'} fillOpacity="0.5" />
    <path d="M31 37 L31 46" />
    <path d="M28 43 L31 46 L34 43" />
    <path d="M28 14 L24 8" />
    <path d="M28 50 L24 56" />
  </HullIcon>
);

/** Light laser ship — sleek hull with long-range beam emitter */
export const IconLightLaser: React.FC<ShipIconProps> = ({ size, tone }) => (
  <HullIcon size={size} tone={tone}>
    <path d="M50 32 L24 16 L18 32 L24 48 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.14" />
    <path d="M50 32 L62 32" strokeOpacity="0.5" strokeDasharray="3 2" />
    <path d="M24 16 L27 28 L27 36 L24 48" />
    <circle cx="36" cy="32" r="3" fill={tone ?? '#5BD7FF'} fillOpacity="0.35" />
    <path d="M18 32 L10 32" />
    <path d="M22 20 L14 14" />
    <path d="M22 44 L14 50" />
  </HullIcon>
);

export const IconMediumFighter: React.FC<ShipIconProps> = ({ size, tone }) => (
  <HullIcon size={size} tone={tone}>
    <path d="M54 32 L24 12 L14 32 L24 52 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.16" />
    <path d="M24 12 L29 27 L29 37 L24 52" />
    <path d="M18 24 L8 18" />
    <path d="M18 40 L8 46" />
    <path d="M54 32 L61 32" />
    <circle cx="37" cy="32" r="3" fill={tone ?? '#5BD7FF'} fillOpacity="0.45" />
    <path d="M26 23 L42 32 L26 41" />
  </HullIcon>
);

export const IconMediumBomber: React.FC<ShipIconProps> = ({ size, tone }) => (
  <HullIcon size={size} tone={tone}>
    <path d="M48 32 L30 10 L10 18 L8 32 L10 46 L30 54 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.14" />
    <path d="M10 18 L40 32 L10 46" />
    <rect x="22" y="26" width="18" height="12" rx="2" />
    <circle cx="30" cy="32" r="2" fill={tone ?? '#5BD7FF'} fillOpacity="0.5" />
    <path d="M30 38 L30 50" />
    <path d="M25 47 L30 52 L35 47" />
    <path d="M14 18 L6 12" />
    <path d="M14 46 L6 52" />
  </HullIcon>
);

export const IconMediumLaser: React.FC<ShipIconProps> = ({ size, tone }) => (
  <HullIcon size={size} tone={tone}>
    <path d="M52 32 L26 12 L16 32 L26 52 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.14" />
    <path d="M52 32 L63 32" strokeOpacity="0.58" strokeDasharray="4 2" />
    <path d="M26 12 L30 28 L30 36 L26 52" />
    <circle cx="38" cy="32" r="4" fill={tone ?? '#5BD7FF'} fillOpacity="0.35" />
    <path d="M16 32 L7 32" />
    <path d="M23 19 L13 12" />
    <path d="M23 45 L13 52" />
  </HullIcon>
);

export const IconHeavyFighter: React.FC<ShipIconProps> = ({ size, tone }) => (
  <HullIcon size={size} tone={tone}>
    <path d="M56 32 L30 8 L10 32 L30 56 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.17" />
    <path d="M30 8 L35 26 L35 38 L30 56" />
    <path d="M15 24 L4 16" />
    <path d="M15 40 L4 48" />
    <path d="M56 32 L63 32" />
    <rect x="30" y="27" width="13" height="10" rx="2" />
    <circle cx="44" cy="32" r="2" fill={tone ?? '#5BD7FF'} fillOpacity="0.55" />
  </HullIcon>
);

export const IconHeavyBomber: React.FC<ShipIconProps> = ({ size, tone }) => (
  <HullIcon size={size} tone={tone}>
    <path d="M50 32 L32 7 L8 16 L6 32 L8 48 L32 57 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.16" />
    <path d="M8 16 L42 32 L8 48" />
    <rect x="18" y="24" width="23" height="16" rx="3" />
    <path d="M25 40 L25 55" />
    <path d="M35 40 L35 55" />
    <path d="M21 51 L25 56 L29 51" />
    <path d="M31 51 L35 56 L39 51" />
    <path d="M14 16 L5 8" />
    <path d="M14 48 L5 56" />
  </HullIcon>
);

export const IconHeavyLaser: React.FC<ShipIconProps> = ({ size, tone }) => (
  <HullIcon size={size} tone={tone}>
    <path d="M54 32 L31 8 L12 32 L31 56 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.16" />
    <path d="M54 32 L63 32" strokeOpacity="0.65" strokeDasharray="5 2" />
    <path d="M31 8 L36 28 L36 36 L31 56" />
    <circle cx="40" cy="32" r="5" fill={tone ?? '#5BD7FF'} fillOpacity="0.36" />
    <path d="M12 32 L3 32" />
    <path d="M24 17 L12 8" />
    <path d="M24 47 L12 56" />
  </HullIcon>
);

export const IconRocketCarrier: React.FC<ShipIconProps> = ({ size, tone }) => (
  <HullIcon size={size} tone={tone}>
    <path d="M50 32 L34 12 L12 20 L12 44 L34 52 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.14" />
    <path d="M16 22 L40 32 L16 42" />
    <rect x="18" y="18" width="8" height="10" rx="2" />
    <rect x="18" y="36" width="8" height="10" rx="2" />
    <path d="M28 23 L42 23" />
    <path d="M28 41 L42 41" />
    <path d="M42 23 L48 20" />
    <path d="M42 41 L48 44" />
    <circle cx="34" cy="32" r="3" fill={tone ?? '#5BD7FF'} fillOpacity="0.4" />
  </HullIcon>
);

export const IconHeavyRocketCarrier: React.FC<ShipIconProps> = ({ size, tone }) => (
  <HullIcon size={size} tone={tone}>
    <path d="M54 32 L36 7 L8 18 L8 46 L36 57 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.16" />
    <path d="M12 20 L44 32 L12 44" />
    <rect x="15" y="15" width="9" height="12" rx="2" />
    <rect x="15" y="37" width="9" height="12" rx="2" />
    <rect x="28" y="20" width="9" height="9" rx="2" />
    <rect x="28" y="35" width="9" height="9" rx="2" />
    <path d="M38 24 L51 19" />
    <path d="M38 40 L51 45" />
    <circle cx="41" cy="32" r="4" fill={tone ?? '#5BD7FF'} fillOpacity="0.35" />
  </HullIcon>
);

/** Medium combat cruiser — wider hull with side turrets */
export const IconCruiser: React.FC<ShipIconProps> = ({ size, tone }) => (
  <HullIcon size={size} tone={tone}>
    <path d="M50 32 L30 10 L14 22 L14 42 L30 54 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.14" />
    <path d="M18 22 L40 32 L18 42" />
    <rect x="12" y="18" width="8" height="6" rx="1" />
    <rect x="12" y="40" width="8" height="6" rx="1" />
    <circle cx="34" cy="32" r="3" fill={tone ?? '#5BD7FF'} fillOpacity="0.4" />
    <path d="M30 10 L26 4" />
    <path d="M30 54 L26 60" />
  </HullIcon>
);

/** Heavy capital battleship — armored bow with broadside batteries */
export const IconBattleship: React.FC<ShipIconProps> = ({ size, tone }) => (
  <HullIcon size={size} tone={tone}>
    <path d="M54 32 L34 8 L10 20 L10 44 L34 56 Z" fill={tone ?? '#5BD7FF'} fillOpacity="0.16" />
    <path d="M14 20 L36 32 L14 44" />
    <rect x="8" y="16" width="10" height="5" rx="1" />
    <rect x="8" y="28" width="10" height="5" rx="1" />
    <rect x="8" y="43" width="10" height="5" rx="1" />
    <circle cx="38" cy="32" r="4" fill={tone ?? '#5BD7FF'} fillOpacity="0.35" />
    <path d="M34 8 L30 2" />
    <path d="M34 56 L30 62" />
  </HullIcon>
);

export const SHIP_BY_TYPE: Record<ShipTypeId, ShipDef> = {
  scout: {
    Icon: IconScout,
    label: 'Scout',
    labels: { en: 'Scout', ru: 'Разведчик' },
    tag: 'SCOUT',
    tags: { en: 'SCOUT', ru: 'РАЗВЕДКА' },
  },
  cargo_light: {
    Icon: IconCargoLight,
    label: 'Lightweight Transporter',
    labels: { en: 'Lightweight Transporter', ru: 'Лёгкий транспорт' },
    tag: 'CARGO',
    tags: { en: 'CARGO', ru: 'ГРУЗ' },
  },
  cargo: {
    Icon: IconCargoLight,
    label: 'Cargo Transport',
    labels: { en: 'Cargo Transport', ru: 'Грузовой транспорт' },
    tag: 'CARGO',
    tags: { en: 'CARGO', ru: 'ГРУЗ' },
  },
  colonizer: {
    Icon: IconColonizer,
    label: 'Colonizer',
    labels: { en: 'Colonizer', ru: 'Колонизатор' },
    tag: 'COLONY',
    tags: { en: 'COLONY', ru: 'КОЛОНИЯ' },
  },
  recon_probe: {
    Icon: IconReconProbe,
    label: 'Recon Probe',
    labels: { en: 'Recon Probe', ru: 'Разведывательный зонд' },
    tag: 'PROBE',
    tags: { en: 'PROBE', ru: 'ЗОНД' },
  },
  refueler: {
    Icon: IconRefueler,
    label: 'Refueler',
    labels: { en: 'Refueler', ru: 'Заправщик' },
    tag: 'SUPPORT',
    tags: { en: 'SUPPORT', ru: 'ПОДДЕРЖКА' },
  },
  fighter: {
    Icon: IconFighter,
    label: 'Fighter',
    labels: { en: 'Fighter', ru: 'Истребитель' },
    tag: 'COMBAT',
    tags: { en: 'COMBAT', ru: 'БОЙ' },
  },
  light_fighter: {
    Icon: IconLightFighter,
    label: 'Light Fighter',
    labels: { en: 'Light Fighter', ru: 'Лёгкий истребитель' },
    tag: 'COMBAT',
    tags: { en: 'COMBAT', ru: 'БОЙ' },
  },
  light_bomber: {
    Icon: IconLightBomber,
    label: 'Light Bomber',
    labels: { en: 'Light Bomber', ru: 'Лёгкий бомбардировщик' },
    tag: 'BOMBER',
    tags: { en: 'BOMBER', ru: 'БОМБАРДИРОВЩИК' },
  },
  light_laser: {
    Icon: IconLightLaser,
    label: 'Light Laser Ship',
    labels: { en: 'Light Laser Ship', ru: 'Лёгкий лазерный корабль' },
    tag: 'COMBAT',
    tags: { en: 'COMBAT', ru: 'БОЙ' },
  },
  medium_fighter: {
    Icon: IconMediumFighter,
    label: 'Medium Fighter',
    labels: { en: 'Medium Fighter', ru: 'Средний истребитель' },
    tag: 'FIGHTER',
    tags: { en: 'FIGHTER', ru: 'ИСТРЕБИТЕЛЬ' },
  },
  medium_bomber: {
    Icon: IconMediumBomber,
    label: 'Medium Bomber',
    labels: { en: 'Medium Bomber', ru: 'Средний бомбардировщик' },
    tag: 'BOMBER',
    tags: { en: 'BOMBER', ru: 'БОМБАРДИРОВЩИК' },
  },
  medium_laser: {
    Icon: IconMediumLaser,
    label: 'Medium Laser Ship',
    labels: { en: 'Medium Laser Ship', ru: 'Средний лазерный корабль' },
    tag: 'LASER',
    tags: { en: 'LASER', ru: 'ЛАЗЕР' },
  },
  heavy_fighter: {
    Icon: IconHeavyFighter,
    label: 'Heavy Fighter',
    labels: { en: 'Heavy Fighter', ru: 'Тяжёлый истребитель' },
    tag: 'FIGHTER',
    tags: { en: 'FIGHTER', ru: 'ИСТРЕБИТЕЛЬ' },
  },
  heavy_bomber: {
    Icon: IconHeavyBomber,
    label: 'Heavy Bomber',
    labels: { en: 'Heavy Bomber', ru: 'Тяжёлый бомбардировщик' },
    tag: 'BOMBER',
    tags: { en: 'BOMBER', ru: 'БОМБАРДИРОВЩИК' },
  },
  heavy_laser: {
    Icon: IconHeavyLaser,
    label: 'Heavy Laser Ship',
    labels: { en: 'Heavy Laser Ship', ru: 'Тяжёлый лазерный корабль' },
    tag: 'LASER',
    tags: { en: 'LASER', ru: 'ЛАЗЕР' },
  },
  rocket_carrier: {
    Icon: IconRocketCarrier,
    label: 'Rocket Carrier',
    labels: { en: 'Rocket Carrier', ru: 'Ракетный носитель' },
    tag: 'CARRIER',
    tags: { en: 'CARRIER', ru: 'НОСИТЕЛЬ' },
  },
  heavy_rocket_carrier: {
    Icon: IconHeavyRocketCarrier,
    label: 'Heavy Rocket Carrier',
    labels: { en: 'Heavy Rocket Carrier', ru: 'Тяжёлый ракетный носитель' },
    tag: 'CARRIER',
    tags: { en: 'CARRIER', ru: 'НОСИТЕЛЬ' },
  },
  cruiser: {
    Icon: IconCruiser,
    label: 'Cruiser',
    labels: { en: 'Cruiser', ru: 'Крейсер' },
    tag: 'COMBAT',
    tags: { en: 'COMBAT', ru: 'БОЙ' },
  },
  battleship: {
    Icon: IconBattleship,
    label: 'Battleship',
    labels: { en: 'Battleship', ru: 'Линкор' },
    tag: 'COMBAT',
    tags: { en: 'COMBAT', ru: 'БОЙ' },
  },
};

export function resolveShipType(typeId: string | undefined | null): ShipDef {
  const id = (typeId ?? '').toLowerCase();
  if (id in SHIP_BY_TYPE) return SHIP_BY_TYPE[id as ShipTypeId];

  if (typeof console !== 'undefined' && typeId) {
    console.warn(`[ships] unknown ship typeId="${typeId}" — rendered as placeholder`);
  }

  return {
    Icon: IconUnknownShip,
    label: shipLabel(typeId, 'en'),
    labels: { en: shipLabel(typeId, 'en'), ru: shipLabel(typeId, 'ru') },
    tag: 'SHIP',
    tags: {
      en: 'SHIP',
      ru: 'КОРАБЛЬ',
    },
  };
}

export function getShipLabel(typeId: string | undefined | null, locale: Locale = 'en'): string {
  return resolveShipType(typeId).labels[locale];
}

export function getShipClassTag(typeId: string | undefined | null, locale: Locale = 'en'): string {
  return resolveShipType(typeId).tags[locale];
}

export function isShipTypeVisible(typeId: string | undefined | null): boolean {
  return !HIDDEN_SHIP_TYPE_IDS.has((typeId ?? '').toLowerCase());
}

export function isShipTypeVisibleInShipyard(typeId: string | undefined | null): boolean {
  return isShipTypeVisible(typeId);
}

export function shipStatusTone(status: string | undefined | null): string {
  if (status === 'building') return '#F4B84A';
  if (status === 'moving') return '#5BD7FF';
  if (status === 'idle') return '#5BFFA9';
  return '#94A3B8';
}

export interface ShipIconByTypeProps extends ShipIconProps {
  typeId: string | undefined | null;
}

export const ShipIcon: React.FC<ShipIconByTypeProps> = ({ typeId, size, tone }) => {
  const def = resolveShipType(typeId);
  const Cmp = def.Icon;
  return <Cmp size={size} tone={tone} />;
};

export interface ShipIconBadgeProps extends ShipIconByTypeProps {
  status?: string | null;
  title?: string;
}

export const ShipIconBadge: React.FC<ShipIconBadgeProps> = ({
  typeId,
  status,
  size = 34,
  tone,
  title,
}) => {
  const resolvedTone = tone ?? shipStatusTone(status);
  return (
    <div className="ship-icon-badge" title={title} style={{ color: resolvedTone }}>
      <ShipIcon typeId={typeId} size={size} tone="currentColor" />
    </div>
  );
};
