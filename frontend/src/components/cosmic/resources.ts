/**
 * Resource icon mapping used by the Cosmic Atlas resource chip.
 * New gameplay resources must be added here before they are shown in UI.
 */
import React from 'react';
import type { Locale } from '@shared/types/locale';
import { resourceLabel } from '@shared/types/entity-labels';

type ResourceIconVariant =
  | 'alloy'
  | 'antimatter'
  | 'circuit'
  | 'composite'
  | 'coolant'
  | 'crystal'
  | 'drop'
  | 'energy'
  | 'fuel'
  | 'gas'
  | 'ice'
  | 'ore'
  | 'organic'
  | 'radioactive';

interface ResourceIconSpec {
  variant: ResourceIconVariant;
  mark: string;
  primary: string;
  secondary: string;
  accent: string;
}

interface ResourceMeta {
  icon: ResourceIconSpec;
  full?: Record<Locale, string>;
}

function icon(
  variant: ResourceIconVariant,
  mark: string,
  primary: string,
  secondary: string,
  accent = '#EAF6FF',
): ResourceIconSpec {
  return { variant, mark, primary, secondary, accent };
}

const RESOURCE_META: Record<string, ResourceMeta> = {
  energy: {
    icon: icon('energy', '⚡', '#F8D45B', '#6B4D12', '#FFF4A6'),
    full: { en: 'Energy', ru: 'Энергия' },
  },
  water: {
    icon: icon('drop', '◌', '#5BD7FF', '#134B6A', '#B6F3FF'),
    full: { en: 'Water', ru: 'Вода' },
  },
  iron: {
    icon: icon('ore', '⬢', '#9AA6B2', '#3D4652'),
    full: { en: 'Iron', ru: 'Железо' },
  },
  carbon: {
    icon: icon('ore', '●', '#5C6670', '#202733', '#D8E2EA'),
    full: { en: 'Carbon', ru: 'Углерод' },
  },
  silicon: {
    icon: icon('crystal', '◇', '#89D7FF', '#214867', '#DAF6FF'),
    full: { en: 'Silicon', ru: 'Кремний' },
  },
  methane: {
    icon: icon('gas', '☁', '#69E2B2', '#1B5141'),
    full: { en: 'Methane', ru: 'Метан' },
  },
  oxygen: {
    icon: icon('gas', '○', '#79E7FF', '#16495A'),
    full: { en: 'Oxygen', ru: 'Кислород' },
  },
  hydrogen: {
    icon: icon('gas', '◎', '#B9F6FF', '#285C68'),
    full: { en: 'Hydrogen', ru: 'Водород' },
  },
  fuel: {
    icon: icon('fuel', '◈', '#F39B4A', '#5B2E14', '#FFD4A1'),
    full: { en: 'Fuel', ru: 'Топливо' },
  },
  copper: {
    icon: icon('ore', '⬟', '#D98245', '#5C2F18', '#FFD0A0'),
    full: { en: 'Copper', ru: 'Медь' },
  },
  aluminum: {
    icon: icon('ore', '▱', '#C7D7E6', '#526375'),
    full: { en: 'Aluminum', ru: 'Алюминий' },
  },
  silver: {
    icon: icon('ore', '◍', '#E5F0F8', '#6E7C8C'),
    full: { en: 'Silver', ru: 'Серебро' },
  },
  titanium: {
    icon: icon('ore', '◆', '#B9C5D9', '#4D5674', '#EEF3FF'),
    full: { en: 'Titanium', ru: 'Титан' },
  },
  ice: {
    icon: icon('ice', '✧', '#B8F1FF', '#24526B', '#F0FCFF'),
    full: { en: 'Ice', ru: 'Лёд' },
  },
  oil: {
    icon: icon('drop', '◐', '#2B3246', '#070A12', '#9CA7C7'),
    full: { en: 'Oil', ru: 'Нефть' },
  },
  sulfur: {
    icon: icon('crystal', '△', '#E7C95F', '#665018', '#FFF0A8'),
    full: { en: 'Sulfur', ru: 'Сера' },
  },
  steel: {
    icon: icon('alloy', '▰', '#A6B2BF', '#384552', '#E8F1FA'),
    full: { en: 'Steel', ru: 'Сталь' },
  },
  electronics: {
    icon: icon('circuit', '▦', '#57E6D6', '#173F4E', '#B8FFF6'),
    full: { en: 'Electronics', ru: 'Электроника' },
  },
  mercury: {
    icon: icon('drop', '◒', '#BFC7D8', '#3E465A', '#F2F6FF'),
    full: { en: 'Mercury', ru: 'Ртуть' },
  },
  magnesium: {
    icon: icon('ore', '⬡', '#DCE4C8', '#59613D', '#FFFFDC'),
    full: { en: 'Magnesium', ru: 'Магний' },
  },
  lead: {
    icon: icon('ore', '■', '#747B87', '#2E3440'),
    full: { en: 'Lead', ru: 'Свинец' },
  },
  nitrogen: {
    icon: icon('gas', '◯', '#8CB4FF', '#233F70', '#D7E6FF'),
    full: { en: 'Nitrogen', ru: 'Азот' },
  },
  uranium: {
    icon: icon('radioactive', '☢', '#B7FF5B', '#2E4D14', '#EBFFB6'),
    full: { en: 'Uranium', ru: 'Уран' },
  },
  cobalt: {
    icon: icon('ore', '⬣', '#4F8DFF', '#17386F', '#B9D5FF'),
    full: { en: 'Cobalt', ru: 'Кобальт' },
  },
  silicon_carbide: {
    icon: icon('composite', '◬', '#86CFF2', '#24344C', '#D7F3FF'),
    full: { en: 'Silicon Carbide', ru: 'Карбид кремния' },
  },
  tritium: {
    icon: icon('gas', '✹', '#9DFFDF', '#1E5D4D', '#DCFFF3'),
    full: { en: 'Tritium', ru: 'Тритий' },
  },
  gold: {
    icon: icon('ore', '✺', '#F5C85B', '#735319', '#FFF0AE'),
    full: { en: 'Gold', ru: 'Золото' },
  },
  jump_fuel: {
    icon: icon('fuel', '✦', '#8A7BFF', '#2D2868', '#E0DBFF'),
    full: { en: 'Jump Fuel', ru: 'Прыжковое топливо' },
  },
  antimatter: {
    icon: icon('antimatter', '✷', '#FF6BD6', '#571F58', '#FFD5F6'),
    full: { en: 'Antimatter', ru: 'Антиматерия' },
  },
  iridium: {
    icon: icon('ore', '✶', '#D3D8FF', '#41496E', '#FFFFFF'),
    full: { en: 'Iridium', ru: 'Иридий' },
  },
  biomass: {
    icon: icon('organic', '✿', '#76E681', '#214F2C', '#C9FFD0'),
    full: { en: 'Biomass', ru: 'Биомасса' },
  },
  liquid_nitrogen: {
    icon: icon('coolant', '❄', '#A8D9FF', '#264765', '#F0FAFF'),
    full: { en: 'Liquid Nitrogen', ru: 'Жидкий азот' },
  },
  military_alloy: {
    icon: icon('alloy', '▨', '#D3D9E6', '#4C566D', '#FFFFFF'),
    full: { en: 'Silver Steel', ru: 'Серебряная сталь' },
  },
  military_composite: {
    icon: icon('composite', '▥', '#7CD5E8', '#24364B', '#DBFAFF'),
    full: { en: 'C/SiC Composite', ru: 'C/SiC-композит' },
  },
};

export const RESOURCE_ICON_IDS = Object.keys(RESOURCE_META);

export function getResourceSymbol(resourceId: string): string {
  const meta = RESOURCE_META[resourceId.toLowerCase()];
  return meta?.icon.mark ?? '◇';
}

export function getResourceLabel(resourceId: string, locale: Locale = 'en'): string {
  return RESOURCE_META[resourceId.toLowerCase()]?.full?.[locale] ?? resourceLabel(resourceId, locale);
}

export interface ResourceIconProps {
  resourceId: string;
  size?: number;
  className?: string;
  title?: string;
}

export function ResourceIcon({
  resourceId,
  size = 18,
  className = 'resource-icon',
  title,
}: ResourceIconProps): React.ReactElement {
  const meta = RESOURCE_META[resourceId.toLowerCase()];
  const spec = meta?.icon ?? icon('crystal', '◇', '#5BD7FF', '#17354B', '#D8F7FF');
  const ariaHidden = title ? undefined : true;

  return React.createElement(
    'svg',
    {
      className,
      width: size,
      height: size,
      viewBox: '0 0 32 32',
      role: title ? 'img' : 'presentation',
      'aria-hidden': ariaHidden,
      focusable: false,
      style: {
        color: spec.accent,
        flex: '0 0 auto',
      },
    },
    [
      title ? React.createElement('title', { key: 'title' }, title) : null,
      React.createElement('circle', {
        key: 'halo',
        cx: 16,
        cy: 16,
        r: 14,
        fill: spec.secondary,
        opacity: 0.22,
      }),
      ...renderIconVariant(spec),
    ],
  );
}

export interface ResourceAmountProps {
  resourceId: string;
  amount: React.ReactNode;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  iconSize?: number;
  className?: string;
  locale?: Locale;
}

export function ResourceAmount({
  resourceId,
  amount,
  prefix,
  suffix,
  iconSize = 14,
  className = 'resource-amount',
  locale = 'en',
}: ResourceAmountProps): React.ReactElement {
  const label = getResourceLabel(resourceId, locale);
  return React.createElement(
    'span',
    {
      className,
      title: label,
    },
    [
      prefix ? React.createElement('span', { key: 'prefix' }, prefix) : null,
      React.createElement(ResourceIcon, {
        key: 'icon',
        resourceId,
        size: iconSize,
        title: label,
      }),
      React.createElement('span', { key: 'amount', className: 'resource-amount-value' }, amount),
      suffix ? React.createElement('span', { key: 'suffix' }, suffix) : null,
    ],
  );
}

export interface ResourceAmountListProps {
  items: { resourceId: string; amount: React.ReactNode }[];
  prefix?: React.ReactNode;
  separator?: React.ReactNode;
  iconSize?: number;
  className?: string;
  locale?: Locale;
}

export function ResourceAmountList({
  items,
  prefix,
  separator,
  iconSize = 14,
  className = 'resource-amount-list',
  locale = 'en',
}: ResourceAmountListProps): React.ReactElement {
  const hasPrefix = prefix !== undefined && prefix !== null && prefix !== false && prefix !== '';
  const hasSeparator = separator !== undefined && separator !== null && separator !== false && separator !== '';

  return React.createElement(
    'span',
    { className },
    items.map((item, index) => {
      const itemPrefix = index > 0 && hasSeparator
        ? React.createElement(React.Fragment, null, [
          React.createElement('span', { key: 'separator', className: 'resource-amount-sep' }, separator),
          hasPrefix ? React.createElement('span', { key: 'prefix' }, prefix) : null,
        ])
        : hasPrefix ? prefix : undefined;

      return React.createElement(ResourceAmount, {
        key: `${item.resourceId}-${index}`,
        resourceId: item.resourceId,
        amount: item.amount,
        prefix: itemPrefix,
        iconSize,
        locale,
      });
    }),
  );
}

function renderIconVariant(spec: ResourceIconSpec): React.ReactElement[] {
  const stroke = {
    stroke: spec.accent,
    strokeWidth: 1.45,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (spec.variant) {
    case 'alloy':
      return [
        React.createElement('path', {
          key: 'plate-1',
          d: 'M8 12.5 16 8l8 4.5-8 4.5-8-4.5Z',
          fill: spec.primary,
          ...stroke,
        }),
        React.createElement('path', {
          key: 'plate-2',
          d: 'M8 16.5 16 21l8-4.5',
          fill: 'none',
          ...stroke,
          opacity: 0.82,
        }),
        React.createElement('path', {
          key: 'plate-3',
          d: 'M8 20.5 16 25l8-4.5',
          fill: 'none',
          ...stroke,
          opacity: 0.58,
        }),
        React.createElement('path', {
          key: 'edge',
          d: 'M16 17v8',
          fill: 'none',
          ...stroke,
          opacity: 0.7,
        }),
      ];
    case 'antimatter':
      return [
        React.createElement('ellipse', {
          key: 'orbit-a',
          cx: 16,
          cy: 16,
          rx: 11,
          ry: 4.8,
          fill: 'none',
          ...stroke,
        }),
        React.createElement('ellipse', {
          key: 'orbit-b',
          cx: 16,
          cy: 16,
          rx: 11,
          ry: 4.8,
          fill: 'none',
          transform: 'rotate(60 16 16)',
          ...stroke,
          opacity: 0.75,
        }),
        React.createElement('ellipse', {
          key: 'orbit-c',
          cx: 16,
          cy: 16,
          rx: 11,
          ry: 4.8,
          fill: 'none',
          transform: 'rotate(120 16 16)',
          ...stroke,
          opacity: 0.75,
        }),
        React.createElement('circle', {
          key: 'core',
          cx: 16,
          cy: 16,
          r: 3.3,
          fill: spec.primary,
          ...stroke,
        }),
      ];
    case 'circuit':
      return [
        React.createElement('rect', {
          key: 'chip',
          x: 9,
          y: 9,
          width: 14,
          height: 14,
          rx: 3,
          fill: spec.primary,
          ...stroke,
        }),
        React.createElement('path', {
          key: 'lines',
          d: 'M13 8V5m6 3V5M13 27v-3m6 3v-3M8 13H5m3 6H5m22-6h-3m3 6h-3',
          fill: 'none',
          ...stroke,
        }),
        React.createElement('path', {
          key: 'trace',
          d: 'M13 17h3v-4h3',
          fill: 'none',
          ...stroke,
          opacity: 0.76,
        }),
      ];
    case 'composite':
      return [
        React.createElement('path', {
          key: 'tile',
          d: 'M9 9h14v14H9z',
          fill: spec.primary,
          ...stroke,
        }),
        React.createElement('path', {
          key: 'weave-a',
          d: 'M9 13h14M9 19h14M13 9v14M19 9v14',
          fill: 'none',
          ...stroke,
          opacity: 0.7,
        }),
        React.createElement('path', {
          key: 'weave-b',
          d: 'M9 9l14 14M23 9 9 23',
          fill: 'none',
          ...stroke,
          opacity: 0.38,
        }),
      ];
    case 'coolant':
      return [
        React.createElement('path', {
          key: 'flask',
          d: 'M13 6h6v6l4 8a4 4 0 0 1-3.6 5.8h-6.8A4 4 0 0 1 9 20l4-8V6Z',
          fill: spec.primary,
          ...stroke,
        }),
        React.createElement('path', {
          key: 'fill',
          d: 'M10.8 20.2c2.1-1.1 3.8.8 5.5 0 1.7-.8 3 .4 4.9-.4',
          fill: 'none',
          ...stroke,
          opacity: 0.82,
        }),
        React.createElement('path', {
          key: 'neck',
          d: 'M12 6h8',
          fill: 'none',
          ...stroke,
        }),
      ];
    case 'crystal':
      return [
        React.createElement('path', {
          key: 'body',
          d: 'M16 5 25 14 16 27 7 14 16 5Z',
          fill: spec.primary,
          ...stroke,
        }),
        React.createElement('path', {
          key: 'facet',
          d: 'M16 5v22M7 14h18M11 10l5 4 5-4',
          fill: 'none',
          ...stroke,
          opacity: 0.64,
        }),
      ];
    case 'drop':
      return [
        React.createElement('path', {
          key: 'drop',
          d: 'M16 4c-4.6 5.1-7.1 9.2-7.1 12.4A7.1 7.1 0 0 0 16 23.5a7.1 7.1 0 0 0 7.1-7.1C23.1 13.2 20.6 9.1 16 4Z',
          fill: spec.primary,
          ...stroke,
        }),
        React.createElement('path', {
          key: 'shine',
          d: 'M13.2 14.4c.4-1.7 1.5-3.4 2.8-5.2',
          fill: 'none',
          ...stroke,
          opacity: 0.55,
        }),
      ];
    case 'energy':
      return [
        React.createElement('path', {
          key: 'bolt',
          d: 'M18.4 4 8.8 17h6.2l-1.3 11 9.9-14h-6.3L18.4 4Z',
          fill: spec.primary,
          ...stroke,
        }),
      ];
    case 'fuel':
      return [
        React.createElement('path', {
          key: 'tank',
          d: 'M10 8h10.5l3.5 3.5V24a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V11a3 3 0 0 1 3-3Z',
          fill: spec.primary,
          ...stroke,
        }),
        React.createElement('path', {
          key: 'gauge',
          d: 'M11 15h9M11 20h6M20.5 8v5H24',
          fill: 'none',
          ...stroke,
          opacity: 0.68,
        }),
      ];
    case 'gas':
      return [
        React.createElement('circle', {
          key: 'bubble-a',
          cx: 13,
          cy: 15,
          r: 5.5,
          fill: spec.primary,
          ...stroke,
        }),
        React.createElement('circle', {
          key: 'bubble-b',
          cx: 19.5,
          cy: 13,
          r: 4.2,
          fill: spec.primary,
          ...stroke,
          opacity: 0.78,
        }),
        React.createElement('circle', {
          key: 'bubble-c',
          cx: 19,
          cy: 20,
          r: 3.5,
          fill: spec.primary,
          ...stroke,
          opacity: 0.6,
        }),
      ];
    case 'ice':
      return [
        React.createElement('path', {
          key: 'flake',
          d: 'M16 5v22M7 11l18 10M25 11 7 21',
          fill: 'none',
          ...stroke,
        }),
        React.createElement('path', {
          key: 'hex',
          d: 'M16 7 24 12v8l-8 5-8-5v-8l8-5Z',
          fill: spec.primary,
          ...stroke,
          opacity: 0.54,
        }),
      ];
    case 'organic':
      return [
        React.createElement('path', {
          key: 'leaf',
          d: 'M8 20c8.5 1.2 14.4-4 16-13-8.8.7-15 5-16 13Z',
          fill: spec.primary,
          ...stroke,
        }),
        React.createElement('path', {
          key: 'stem',
          d: 'M9 24c3.8-5.3 8-8.8 13-12',
          fill: 'none',
          ...stroke,
        }),
        React.createElement('circle', {
          key: 'spore',
          cx: 10,
          cy: 10,
          r: 2.4,
          fill: spec.secondary,
          ...stroke,
          opacity: 0.7,
        }),
      ];
    case 'radioactive':
      return [
        React.createElement('circle', {
          key: 'core',
          cx: 16,
          cy: 16,
          r: 3,
          fill: spec.primary,
          ...stroke,
        }),
        React.createElement('path', {
          key: 'ray-a',
          d: 'M16 6a10 10 0 0 1 5.4 1.6L18 14a4 4 0 0 0-2-.6V6Z',
          fill: spec.primary,
          ...stroke,
        }),
        React.createElement('path', {
          key: 'ray-b',
          d: 'M25.2 20.2a10 10 0 0 1-4.9 4.4L17 18.2a4 4 0 0 0 1.8-1.4l6.4 3.4Z',
          fill: spec.primary,
          ...stroke,
        }),
        React.createElement('path', {
          key: 'ray-c',
          d: 'M6.8 20.2l6.4-3.4a4 4 0 0 0 1.8 1.4l-3.3 6.4a10 10 0 0 1-4.9-4.4Z',
          fill: spec.primary,
          ...stroke,
        }),
      ];
    case 'ore':
    default:
      return [
        React.createElement('path', {
          key: 'rock',
          d: 'M10 7h9l6 7-3 11H10L6 16l4-9Z',
          fill: spec.primary,
          ...stroke,
        }),
        React.createElement('path', {
          key: 'vein',
          d: 'M12 10 9 16l5 3 1 5M19 8l-3 7 6 2',
          fill: 'none',
          ...stroke,
          opacity: 0.58,
        }),
      ];
  }
}

/**
 * Calculates fresh resource amount based on regen rate per hour.
 * Acceptance criteria: regenRate is divided by 3600 for per-second increment.
 */
export function calculateRegen(
  currentAmount: number,
  regenRatePerHour: number,
  deltaSeconds: number,
  storageCap: number,
): number {
  const regenRatePerSecond = regenRatePerHour / 3600;
  return Math.min(currentAmount + regenRatePerSecond * deltaSeconds, storageCap);
}
