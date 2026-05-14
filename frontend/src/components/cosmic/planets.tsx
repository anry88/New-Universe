/**
 * New Universe — Cosmic Atlas planet biome SVGs.
 * Ported from `design-bundle/project/art.jsx`. Cohesive flat-vector style:
 * 1.5px strokes, gradient fills, no external assets. Sized via `size` prop;
 * intrinsic palette per biome.
 */
import React from 'react';
import type { Locale } from '@shared/types/locale';

export type Biome =
  | 'rocky'
  | 'ocean'
  | 'gas_giant'
  | 'ice'
  | 'volcanic'
  | 'green'
  | 'anomaly'
  | 'toxic'
  | 'metallic'
  | 'energy'
  | 'unknown';

export interface BiomeMeta {
  label: string;
  labels: Record<Locale, string>;
  tag: string;
  tags: Record<Locale, string>;
  accent: string;
  hue: number;
}

export const BIOME_META: Record<Biome, BiomeMeta> = {
  rocky: { label: 'Rocky', labels: { en: 'Rocky', ru: 'Каменистая' }, tag: 'TERRESTRIAL', tags: { en: 'TERRESTRIAL', ru: 'ТВЕРДАЯ' }, accent: '#C7A582', hue: 30 },
  ocean: { label: 'Ocean', labels: { en: 'Ocean', ru: 'Океаническая' }, tag: 'AQUATIC', tags: { en: 'AQUATIC', ru: 'ОКЕАН' }, accent: '#7DD8E8', hue: 195 },
  gas_giant: { label: 'Gas Giant', labels: { en: 'Gas Giant', ru: 'Газовый гигант' }, tag: 'ATMOSPHERIC', tags: { en: 'ATMOSPHERIC', ru: 'АТМОСФЕРНАЯ' }, accent: '#E6C58A', hue: 38 },
  ice: { label: 'Ice', labels: { en: 'Ice', ru: 'Ледяная' }, tag: 'CRYOGENIC', tags: { en: 'CRYOGENIC', ru: 'КРИО' }, accent: '#9BC6E0', hue: 210 },
  volcanic: { label: 'Volcanic', labels: { en: 'Volcanic', ru: 'Вулканическая' }, tag: 'MAGMATIC', tags: { en: 'MAGMATIC', ru: 'МАГМА' }, accent: '#FF6B2C', hue: 18 },
  green: { label: 'Green', labels: { en: 'Green', ru: 'Зеленая' }, tag: 'BIOTIC', tags: { en: 'BIOTIC', ru: 'БИО' }, accent: '#9FE0B5', hue: 150 },
  anomaly: { label: 'Anomaly', labels: { en: 'Anomaly', ru: 'Аномалия' }, tag: 'EXOTIC', tags: { en: 'EXOTIC', ru: 'ЭКЗОТИКА' }, accent: '#E0B0FF', hue: 280 },
  toxic: { label: 'Toxic', labels: { en: 'Toxic', ru: 'Токсичная' }, tag: 'HAZARD', tags: { en: 'HAZARD', ru: 'ТОКСИН' }, accent: '#B6FF6A', hue: 92 },
  metallic: { label: 'Metallic', labels: { en: 'Metallic', ru: 'Металлическая' }, tag: 'METALLIC', tags: { en: 'METALLIC', ru: 'МЕТАЛЛ' }, accent: '#D7DEE8', hue: 220 },
  energy: { label: 'Energetic', labels: { en: 'Energetic', ru: 'Энергетическая' }, tag: 'ENERGY', tags: { en: 'ENERGY', ru: 'ЭНЕРГИЯ' }, accent: '#7DF9FF', hue: 184 },
  unknown: { label: 'Unknown', labels: { en: 'Unknown', ru: 'Неизвестно' }, tag: 'UNIDENTIFIED', tags: { en: 'UNIDENTIFIED', ru: 'НЕИЗВЕСТНО' }, accent: '#96AFD2', hue: 210 },
};

export interface PlanetSvgProps {
  size?: number;
  /** Optional id suffix to keep SVG defs unique when many SVGs share a page. */
  uid?: string;
}

const u = (uid?: string) => (uid ? `-${uid}` : '');

export const PlanetRocky: React.FC<PlanetSvgProps> = ({ size = 88, uid }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id={`rocky-g${u(uid)}`} cx="35%" cy="32%" r="75%">
        <stop offset="0%" stopColor="#C7A582" />
        <stop offset="55%" stopColor="#8B6A4F" />
        <stop offset="100%" stopColor="#3F2C1E" />
      </radialGradient>
      <clipPath id={`rocky-c${u(uid)}`}>
        <circle cx="50" cy="50" r="46" />
      </clipPath>
    </defs>
    <circle cx="50" cy="50" r="46" fill={`url(#rocky-g${u(uid)})`} />
    <g clipPath={`url(#rocky-c${u(uid)})`} fill="#3F2C1E" opacity="0.55">
      <circle cx="32" cy="38" r="6" />
      <circle cx="61" cy="30" r="3.5" />
      <circle cx="70" cy="58" r="5" />
      <circle cx="40" cy="68" r="4" />
      <circle cx="55" cy="55" r="2.5" />
      <circle cx="22" cy="58" r="2.8" />
    </g>
    <g clipPath={`url(#rocky-c${u(uid)})`} fill="#E5C8A4" opacity="0.4">
      <circle cx="32" cy="38" r="2.2" />
      <circle cx="70" cy="58" r="1.8" />
      <circle cx="40" cy="68" r="1.5" />
    </g>
    <circle cx="50" cy="50" r="46" fill="none" stroke="#1A0F08" strokeOpacity="0.6" strokeWidth="1" />
  </svg>
);

export const PlanetOcean: React.FC<PlanetSvgProps> = ({ size = 88, uid }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id={`oc-g${u(uid)}`} cx="38%" cy="35%" r="75%">
        <stop offset="0%" stopColor="#7DD8E8" />
        <stop offset="55%" stopColor="#2E7AB8" />
        <stop offset="100%" stopColor="#0F2E55" />
      </radialGradient>
      <clipPath id={`oc-c${u(uid)}`}>
        <circle cx="50" cy="50" r="46" />
      </clipPath>
    </defs>
    <circle cx="50" cy="50" r="46" fill={`url(#oc-g${u(uid)})`} />
    <g clipPath={`url(#oc-c${u(uid)})`} fill="#E8F8FF" opacity="0.55">
      <path d="M5 40 q15 -5 30 0 t30 0 t30 0 v3 q-15 5 -30 0 t-30 0 t-30 0z" />
      <path d="M5 60 q15 -5 30 0 t30 0 t30 0 v3 q-15 5 -30 0 t-30 0 t-30 0z" opacity="0.7" />
      <path d="M5 76 q15 -4 30 0 t30 0 t30 0 v2 q-15 4 -30 0 t-30 0 t-30 0z" opacity="0.5" />
    </g>
    <g clipPath={`url(#oc-c${u(uid)})`} fill="#1B4A78" opacity="0.45">
      <ellipse cx="38" cy="50" rx="9" ry="3" />
      <ellipse cx="65" cy="42" rx="6" ry="2" />
    </g>
    <circle cx="50" cy="50" r="46" fill="none" stroke="#06192E" strokeOpacity="0.55" strokeWidth="1" />
  </svg>
);

export const PlanetGasGiant: React.FC<PlanetSvgProps> = ({ size = 88, uid }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id={`gg-g${u(uid)}`} cx="40%" cy="40%" r="80%">
        <stop offset="0%" stopColor="#F7D9A0" />
        <stop offset="60%" stopColor="#C97A3A" />
        <stop offset="100%" stopColor="#5C2A12" />
      </radialGradient>
      <clipPath id={`gg-c${u(uid)}`}>
        <circle cx="50" cy="50" r="36" />
      </clipPath>
    </defs>
    <ellipse cx="50" cy="52" rx="48" ry="11" fill="none" stroke="#E6C58A" strokeWidth="1.4" opacity="0.85" />
    <ellipse cx="50" cy="52" rx="44" ry="9" fill="none" stroke="#E6C58A" strokeWidth="0.8" opacity="0.55" />
    <circle cx="50" cy="50" r="36" fill={`url(#gg-g${u(uid)})`} />
    <g clipPath={`url(#gg-c${u(uid)})`} stroke="#7A3A18" strokeWidth="2.2" fill="none" opacity="0.55">
      <path d="M14 38 h72" />
      <path d="M14 46 h72" />
      <path d="M14 56 h72" />
      <path d="M14 64 h72" />
    </g>
    <g clipPath={`url(#gg-c${u(uid)})`} fill="#F4E0B5" opacity="0.45">
      <ellipse cx="64" cy="56" rx="6" ry="2" />
    </g>
    <path d="M2 52 q48 11 96 0" fill="none" stroke="#E6C58A" strokeWidth="1.4" opacity="0.95" />
    <circle cx="50" cy="50" r="36" fill="none" stroke="#3D1A06" strokeOpacity="0.55" strokeWidth="1" />
  </svg>
);

export const PlanetIce: React.FC<PlanetSvgProps> = ({ size = 88, uid }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id={`ice-g${u(uid)}`} cx="38%" cy="32%" r="78%">
        <stop offset="0%" stopColor="#F0FAFF" />
        <stop offset="55%" stopColor="#9BC6E0" />
        <stop offset="100%" stopColor="#3E6A8C" />
      </radialGradient>
      <clipPath id={`ice-c${u(uid)}`}>
        <circle cx="50" cy="50" r="46" />
      </clipPath>
    </defs>
    <circle cx="50" cy="50" r="46" fill={`url(#ice-g${u(uid)})`} />
    <g clipPath={`url(#ice-c${u(uid)})`} stroke="#3E6A8C" strokeWidth="1.2" fill="none" opacity="0.7">
      <path d="M30 22 L42 42 L34 56 L48 70 L40 92" />
      <path d="M62 14 L58 36 L72 48 L66 64 L78 82" />
      <path d="M14 60 L34 56" />
      <path d="M58 36 L42 42" />
    </g>
    <g clipPath={`url(#ice-c${u(uid)})`} fill="#FFFFFF" opacity="0.85">
      <path d="M50 8 a 42 14 0 0 0 0 22 a 42 14 0 0 0 0 -22z" />
      <path d="M50 92 a 42 14 0 0 0 0 -22 a 42 14 0 0 0 0 22z" />
    </g>
    <circle cx="50" cy="50" r="46" fill="none" stroke="#1B3A56" strokeOpacity="0.5" strokeWidth="1" />
  </svg>
);

export const PlanetVolcanic: React.FC<PlanetSvgProps> = ({ size = 88, uid }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id={`v-g${u(uid)}`} cx="40%" cy="38%" r="75%">
        <stop offset="0%" stopColor="#3A2118" />
        <stop offset="60%" stopColor="#1A0E0A" />
        <stop offset="100%" stopColor="#080404" />
      </radialGradient>
      <clipPath id={`v-c${u(uid)}`}>
        <circle cx="50" cy="50" r="46" />
      </clipPath>
    </defs>
    <circle cx="50" cy="50" r="46" fill={`url(#v-g${u(uid)})`} />
    <g clipPath={`url(#v-c${u(uid)})`} stroke="#FF6B2C" strokeWidth="1.6" fill="none">
      <path d="M22 30 L36 42 L48 38 L62 52 L78 48" />
      <path d="M16 64 L30 58 L42 70 L60 64 L74 76" />
      <path d="M48 38 L42 70" opacity="0.7" />
      <path d="M62 52 L60 64" opacity="0.7" />
    </g>
    <g clipPath={`url(#v-c${u(uid)})`} fill="#FFB347">
      <circle cx="36" cy="42" r="2.2" />
      <circle cx="62" cy="52" r="2.6" />
      <circle cx="42" cy="70" r="2" />
      <circle cx="74" cy="76" r="1.8" />
    </g>
    <circle cx="50" cy="50" r="46" fill="none" stroke="#FF6B2C" strokeOpacity="0.45" strokeWidth="1" />
  </svg>
);

export const PlanetGreen: React.FC<PlanetSvgProps> = ({ size = 88, uid }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id={`gr-g${u(uid)}`} cx="38%" cy="35%" r="78%">
        <stop offset="0%" stopColor="#9FE0B5" />
        <stop offset="55%" stopColor="#3E9466" />
        <stop offset="100%" stopColor="#0F3A2A" />
      </radialGradient>
      <clipPath id={`gr-c${u(uid)}`}>
        <circle cx="50" cy="50" r="46" />
      </clipPath>
    </defs>
    <circle cx="50" cy="50" r="46" fill={`url(#gr-g${u(uid)})`} />
    <g clipPath={`url(#gr-c${u(uid)})`} fill="#1F5C42" opacity="0.7">
      <path d="M22 32 q8 -4 16 0 q4 6 -2 12 q-10 2 -14 -4 z" />
      <path d="M55 24 q12 0 18 8 q-2 8 -10 10 q-12 -2 -8 -18 z" />
      <path d="M30 60 q14 -6 26 2 q4 10 -6 14 q-18 4 -20 -16 z" />
      <path d="M70 56 q8 0 10 8 q-2 8 -10 6 q-6 -6 0 -14 z" />
    </g>
    <g clipPath={`url(#gr-c${u(uid)})`} fill="#FFFFFF" opacity="0.35">
      <ellipse cx="42" cy="40" rx="12" ry="2" />
      <ellipse cx="60" cy="68" rx="10" ry="2" />
    </g>
    <circle cx="50" cy="50" r="46" fill="none" stroke="#0A2418" strokeOpacity="0.6" strokeWidth="1" />
  </svg>
);

export const PlanetAnomaly: React.FC<PlanetSvgProps> = ({ size = 88, uid }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id={`an-g${u(uid)}`} cx="50%" cy="50%" r="60%">
        <stop offset="0%" stopColor="#E0B0FF" />
        <stop offset="40%" stopColor="#7B3FBF" />
        <stop offset="100%" stopColor="#160826" />
      </radialGradient>
      <radialGradient id={`an-glow${u(uid)}`} cx="50%" cy="50%" r="60%">
        <stop offset="0%" stopColor="#E0B0FF" stopOpacity="0.6" />
        <stop offset="100%" stopColor="#E0B0FF" stopOpacity="0" />
      </radialGradient>
      <clipPath id={`an-c${u(uid)}`}>
        <circle cx="50" cy="50" r="46" />
      </clipPath>
    </defs>
    <circle cx="50" cy="50" r="48" fill={`url(#an-glow${u(uid)})`} />
    <circle cx="50" cy="50" r="46" fill={`url(#an-g${u(uid)})`} />
    <g clipPath={`url(#an-c${u(uid)})`} stroke="#E0B0FF" strokeWidth="1.2" fill="none" opacity="0.8">
      <path d="M50 8 q-12 22 0 42 q12 20 0 42" />
      <path d="M14 50 q22 -12 42 0 q20 12 42 0" opacity="0.6" />
    </g>
    <circle cx="50" cy="50" r="6" fill="#FFFFFF" opacity="0.85" />
    <circle cx="50" cy="50" r="46" fill="none" stroke="#E0B0FF" strokeOpacity="0.5" strokeWidth="1" />
  </svg>
);

export const PlanetToxic: React.FC<PlanetSvgProps> = ({ size = 88, uid }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id={`tox-g${u(uid)}`} cx="40%" cy="35%" r="75%">
        <stop offset="0%" stopColor="#D8FF8A" />
        <stop offset="48%" stopColor="#5F9E35" />
        <stop offset="100%" stopColor="#18260D" />
      </radialGradient>
      <clipPath id={`tox-c${u(uid)}`}>
        <circle cx="50" cy="50" r="46" />
      </clipPath>
    </defs>
    <circle cx="50" cy="50" r="46" fill={`url(#tox-g${u(uid)})`} />
    <g clipPath={`url(#tox-c${u(uid)})`} fill="none" stroke="#D8FF8A" strokeWidth="1.6" opacity="0.75">
      <path d="M12 36 q18 -10 36 0 t40 0" />
      <path d="M8 58 q20 10 42 0 t42 0" />
      <path d="M26 78 q16 -8 32 0 t30 0" opacity="0.55" />
    </g>
    <g clipPath={`url(#tox-c${u(uid)})`} fill="#F2FFB2" opacity="0.8">
      <circle cx="34" cy="42" r="3" />
      <circle cx="67" cy="57" r="4" />
      <circle cx="49" cy="72" r="2.2" />
    </g>
    <circle cx="50" cy="50" r="46" fill="none" stroke="#B6FF6A" strokeOpacity="0.5" strokeWidth="1" />
  </svg>
);

export const PlanetMetallic: React.FC<PlanetSvgProps> = ({ size = 88, uid }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id={`met-g${u(uid)}`} cx="32%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="42%" stopColor="#AAB7C8" />
        <stop offset="100%" stopColor="#243246" />
      </radialGradient>
      <clipPath id={`met-c${u(uid)}`}>
        <circle cx="50" cy="50" r="46" />
      </clipPath>
    </defs>
    <circle cx="50" cy="50" r="46" fill={`url(#met-g${u(uid)})`} />
    <g clipPath={`url(#met-c${u(uid)})`} fill="#D7DEE8" opacity="0.75">
      <path d="M20 36 l18 -10 l16 12 l-8 16 l-20 2z" />
      <path d="M56 58 l22 -8 l10 14 l-14 16 l-22 -6z" opacity="0.7" />
      <path d="M48 18 l16 4 l-6 12 l-18 -2z" opacity="0.55" />
    </g>
    <g clipPath={`url(#met-c${u(uid)})`} stroke="#FFFFFF" strokeWidth="1" opacity="0.55">
      <path d="M10 48 h80" />
      <path d="M18 68 h64" />
    </g>
    <circle cx="50" cy="50" r="46" fill="none" stroke="#D7DEE8" strokeOpacity="0.55" strokeWidth="1" />
  </svg>
);

export const PlanetEnergy: React.FC<PlanetSvgProps> = ({ size = 88, uid }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id={`en-g${u(uid)}`} cx="50%" cy="50%" r="70%">
        <stop offset="0%" stopColor="#E7FFFF" />
        <stop offset="45%" stopColor="#2DB7FF" />
        <stop offset="100%" stopColor="#051A44" />
      </radialGradient>
      <radialGradient id={`en-glow${u(uid)}`} cx="50%" cy="50%" r="60%">
        <stop offset="0%" stopColor="#7DF9FF" stopOpacity="0.75" />
        <stop offset="100%" stopColor="#7DF9FF" stopOpacity="0" />
      </radialGradient>
      <clipPath id={`en-c${u(uid)}`}>
        <circle cx="50" cy="50" r="44" />
      </clipPath>
    </defs>
    <circle cx="50" cy="50" r="50" fill={`url(#en-glow${u(uid)})`} />
    <circle cx="50" cy="50" r="44" fill={`url(#en-g${u(uid)})`} />
    <g clipPath={`url(#en-c${u(uid)})`} stroke="#E7FFFF" strokeWidth="1.5" fill="none" opacity="0.85">
      <path d="M52 8 L38 44 h18 L44 92 L68 48 H50z" />
      <circle cx="50" cy="50" r="28" opacity="0.45" />
      <circle cx="50" cy="50" r="16" opacity="0.35" />
    </g>
    <circle cx="50" cy="50" r="44" fill="none" stroke="#7DF9FF" strokeOpacity="0.7" strokeWidth="1" />
  </svg>
);

export const PlanetFog: React.FC<PlanetSvgProps> = ({ size = 88, uid }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id={`fog-g${u(uid)}`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#96AFD2" stopOpacity="0.5" />
        <stop offset="70%" stopColor="#96AFD2" stopOpacity="0.15" />
        <stop offset="100%" stopColor="#96AFD2" stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="48" fill={`url(#fog-g${u(uid)})`} />
    <path
      d="M30 40 q10 -10 20 0 t20 0 t10 10"
      stroke="#96AFD2"
      strokeWidth="1.5"
      strokeOpacity="0.25"
      fill="none"
    />
    <path
      d="M25 60 q15 5 30 0 t30 0"
      stroke="#96AFD2"
      strokeWidth="1.5"
      strokeOpacity="0.15"
      fill="none"
    />
  </svg>
);

export const PLANET_BY_BIOME: Record<Biome, React.FC<PlanetSvgProps>> = {
  rocky: PlanetRocky,
  ocean: PlanetOcean,
  gas_giant: PlanetGasGiant,
  ice: PlanetIce,
  volcanic: PlanetVolcanic,
  green: PlanetGreen,
  anomaly: PlanetAnomaly,
  toxic: PlanetToxic,
  metallic: PlanetMetallic,
  energy: PlanetEnergy,
  unknown: PlanetFog,
};

/**
 * Resolve any biome string (including unknown / legacy values) to a known biome,
 * falling back to `rocky` so the UI never crashes when the backend introduces
 * a new biome before the frontend ships an icon for it.
 */
export function resolveBiome(value: string | undefined | null): Biome {
  const v = (value || '').toLowerCase();
  if (v in PLANET_BY_BIOME) return v as Biome;
  // Map a few common backend synonyms.
  if (v === 'gas' || v === 'gasgiant' || v === 'gas-giant') return 'gas_giant';
  if (v === 'desert' || v === 'arid' || v === 'terrestrial') return 'rocky';
  if (v === 'aquatic' || v === 'water') return 'ocean';
  if (v === 'forest' || v === 'biotic' || v === 'jungle') return 'green';
  if (v === 'lava' || v === 'magmatic') return 'volcanic';
  if (v === 'frozen' || v === 'cryogenic') return 'ice';
  if (v === 'exotic') return 'anomaly';
  if (v === 'hazard' || v === 'toxin') return 'toxic';
  if (v === 'metal' || v === 'ore') return 'metallic';
  if (v === 'energetic' || v === 'power') return 'energy';
  if (v === 'unknown' || v === 'fog' || v === 'locked') return 'unknown';
  return 'rocky';
}

export function getBiomeLabel(value: string | undefined | null, locale: Locale = 'en'): string {
  return BIOME_META[resolveBiome(value)].labels[locale];
}

export function getBiomeTag(value: string | undefined | null, locale: Locale = 'en'): string {
  return BIOME_META[resolveBiome(value)].tags[locale];
}

export interface PlanetSvgByBiomeProps extends PlanetSvgProps {
  biome: string;
}

export const PlanetSvg: React.FC<PlanetSvgByBiomeProps> = ({ biome, ...rest }) => {
  const Cmp = PLANET_BY_BIOME[resolveBiome(biome)];
  return <Cmp {...rest} />;
};

/**
 * Animated starfield used as the screen background.
 *
 * Each star is an absolutely-positioned `<span>` with a CSS `starDrift`
 * animation that slowly translates it from above the viewport to below.
 * Three independent layers run at different speeds and sizes so the field
 * has parallax depth: tiny near-zero-opacity dots far back, medium grains,
 * and a few brighter blurred specks in front.
 *
 * Positioning is deterministic per `seed` so the same planet always shows the
 * same starfield (no flickering when React re-renders).
 */
export const Stars: React.FC<{ density?: number; seed?: number }> = ({ density = 70, seed = 1 }) => {
  let s = seed || 1;
  const rand = () => (s = (s * 9301 + 49297) % 233280) / 233280;

  // Generate three layers. Total star count ≈ density.
  const layers = [
    { count: Math.round(density * 0.5), minSize: 0.6, maxSize: 1.1, minDur: 38, maxDur: 70, blur: 0, alpha: 0.55 }, // far
    { count: Math.round(density * 0.35), minSize: 1.0, maxSize: 1.7, minDur: 22, maxDur: 38, blur: 0.4, alpha: 0.75 }, // mid
    { count: Math.round(density * 0.15), minSize: 1.6, maxSize: 2.6, minDur: 14, maxDur: 24, blur: 0.8, alpha: 0.9 }, // near
  ];

  const stars: React.CSSProperties[] = [];
  layers.forEach((layer) => {
    for (let i = 0; i < layer.count; i++) {
      const size = layer.minSize + rand() * (layer.maxSize - layer.minSize);
      const duration = layer.minDur + rand() * (layer.maxDur - layer.minDur);
      // Stagger start positions across the full animation so the field looks
      // populated immediately instead of drifting in from the top.
      const delay = -rand() * duration;
      stars.push({
        position: 'absolute',
        left: `${rand() * 100}%`,
        // top is animated; start above the viewport so the keyframe handles
        // the initial offset.
        top: 0,
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: '#E8EDF5',
        opacity: 0.25 + rand() * layer.alpha,
        boxShadow: `0 0 ${Math.max(2, size * 1.6)}px rgba(232,237,245,0.45)`,
        filter: layer.blur ? `blur(${layer.blur}px)` : undefined,
        animation: `starDrift ${duration}s linear infinite`,
        animationDelay: `${delay}s`,
        willChange: 'transform',
      });
    }
  });

  return (
    <div className="stars" aria-hidden="true">
      {stars.map((style, i) => (
        <span key={i} style={style} />
      ))}
    </div>
  );
};
