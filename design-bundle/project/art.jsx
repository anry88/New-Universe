/* eslint-disable */
// Planet biome SVGs + Building SVGs.
// Cohesive flat-vector style: monochromatic per element, 1.5px strokes,
// circles + simple paths only. Designed for ~80–112px display size.

// ---------- shared building bg disc ----------
const BiomeDisc = ({ size = 88, palette }) => (
  <circle cx={size / 2} cy={size / 2} r={size / 2 - 1}
    fill={palette.bg} stroke={palette.ring} strokeWidth="1" />
);

// ===========================================================
// PLANET BIOMES — 7 of them, each in <svg viewBox="0 0 100 100">
// Each takes a "size" prop. Palette is intrinsic per biome.
// ===========================================================

const PlanetRocky = ({ size = 88 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id="rocky-g" cx="35%" cy="32%" r="75%">
        <stop offset="0%" stopColor="#C7A582" />
        <stop offset="55%" stopColor="#8B6A4F" />
        <stop offset="100%" stopColor="#3F2C1E" />
      </radialGradient>
      <clipPath id="rocky-c"><circle cx="50" cy="50" r="46" /></clipPath>
    </defs>
    <circle cx="50" cy="50" r="46" fill="url(#rocky-g)" />
    <g clipPath="url(#rocky-c)" fill="#3F2C1E" opacity="0.55">
      <circle cx="32" cy="38" r="6" />
      <circle cx="61" cy="30" r="3.5" />
      <circle cx="70" cy="58" r="5" />
      <circle cx="40" cy="68" r="4" />
      <circle cx="55" cy="55" r="2.5" />
      <circle cx="22" cy="58" r="2.8" />
    </g>
    <g clipPath="url(#rocky-c)" fill="#E5C8A4" opacity="0.4">
      <circle cx="32" cy="38" r="2.2" />
      <circle cx="70" cy="58" r="1.8" />
      <circle cx="40" cy="68" r="1.5" />
    </g>
    <circle cx="50" cy="50" r="46" fill="none" stroke="#1A0F08" strokeOpacity="0.6" strokeWidth="1" />
  </svg>
);

const PlanetOcean = ({ size = 88 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id="oc-g" cx="38%" cy="35%" r="75%">
        <stop offset="0%" stopColor="#7DD8E8" />
        <stop offset="55%" stopColor="#2E7AB8" />
        <stop offset="100%" stopColor="#0F2E55" />
      </radialGradient>
      <clipPath id="oc-c"><circle cx="50" cy="50" r="46" /></clipPath>
    </defs>
    <circle cx="50" cy="50" r="46" fill="url(#oc-g)" />
    <g clipPath="url(#oc-c)" fill="#E8F8FF" opacity="0.55">
      <path d="M5 40 q15 -5 30 0 t30 0 t30 0 v3 q-15 5 -30 0 t-30 0 t-30 0z" />
      <path d="M5 60 q15 -5 30 0 t30 0 t30 0 v3 q-15 5 -30 0 t-30 0 t-30 0z" opacity="0.7" />
      <path d="M5 76 q15 -4 30 0 t30 0 t30 0 v2 q-15 4 -30 0 t-30 0 t-30 0z" opacity="0.5" />
    </g>
    <g clipPath="url(#oc-c)" fill="#1B4A78" opacity="0.45">
      <ellipse cx="38" cy="50" rx="9" ry="3" />
      <ellipse cx="65" cy="42" rx="6" ry="2" />
    </g>
    <circle cx="50" cy="50" r="46" fill="none" stroke="#06192E" strokeOpacity="0.55" strokeWidth="1" />
  </svg>
);

const PlanetGasGiant = ({ size = 88 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id="gg-g" cx="40%" cy="40%" r="80%">
        <stop offset="0%" stopColor="#F7D9A0" />
        <stop offset="60%" stopColor="#C97A3A" />
        <stop offset="100%" stopColor="#5C2A12" />
      </radialGradient>
      <clipPath id="gg-c"><circle cx="50" cy="50" r="36" /></clipPath>
    </defs>
    {/* ring back */}
    <ellipse cx="50" cy="52" rx="48" ry="11" fill="none" stroke="#E6C58A" strokeWidth="1.4" opacity="0.85" />
    <ellipse cx="50" cy="52" rx="44" ry="9" fill="none" stroke="#E6C58A" strokeWidth="0.8" opacity="0.55" />
    {/* planet */}
    <circle cx="50" cy="50" r="36" fill="url(#gg-g)" />
    <g clipPath="url(#gg-c)" stroke="#7A3A18" strokeWidth="2.2" fill="none" opacity="0.55">
      <path d="M14 38 h72" />
      <path d="M14 46 h72" />
      <path d="M14 56 h72" />
      <path d="M14 64 h72" />
    </g>
    <g clipPath="url(#gg-c)" fill="#F4E0B5" opacity="0.45">
      <ellipse cx="64" cy="56" rx="6" ry="2" />
    </g>
    {/* ring front */}
    <path d="M2 52 q48 11 96 0" fill="none" stroke="#E6C58A" strokeWidth="1.4" opacity="0.95" />
    <circle cx="50" cy="50" r="36" fill="none" stroke="#3D1A06" strokeOpacity="0.55" strokeWidth="1" />
  </svg>
);

const PlanetIce = ({ size = 88 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id="ice-g" cx="38%" cy="32%" r="78%">
        <stop offset="0%" stopColor="#F0FAFF" />
        <stop offset="55%" stopColor="#9BC6E0" />
        <stop offset="100%" stopColor="#3E6A8C" />
      </radialGradient>
      <clipPath id="ice-c"><circle cx="50" cy="50" r="46" /></clipPath>
    </defs>
    <circle cx="50" cy="50" r="46" fill="url(#ice-g)" />
    <g clipPath="url(#ice-c)" stroke="#3E6A8C" strokeWidth="1.2" fill="none" opacity="0.7">
      <path d="M30 22 L42 42 L34 56 L48 70 L40 92" />
      <path d="M62 14 L58 36 L72 48 L66 64 L78 82" />
      <path d="M14 60 L34 56" />
      <path d="M58 36 L42 42" />
    </g>
    <g clipPath="url(#ice-c)" fill="#FFFFFF" opacity="0.85">
      <path d="M50 8 a 42 14 0 0 0 0 22 a 42 14 0 0 0 0 -22z" />
      <path d="M50 92 a 42 14 0 0 0 0 -22 a 42 14 0 0 0 0 22z" />
    </g>
    <circle cx="50" cy="50" r="46" fill="none" stroke="#1B3A56" strokeOpacity="0.5" strokeWidth="1" />
  </svg>
);

const PlanetVolcanic = ({ size = 88 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id="v-g" cx="40%" cy="38%" r="75%">
        <stop offset="0%" stopColor="#3A2118" />
        <stop offset="60%" stopColor="#1A0E0A" />
        <stop offset="100%" stopColor="#080404" />
      </radialGradient>
      <clipPath id="v-c"><circle cx="50" cy="50" r="46" /></clipPath>
    </defs>
    <circle cx="50" cy="50" r="46" fill="url(#v-g)" />
    <g clipPath="url(#v-c)" stroke="#FF6B2C" strokeWidth="1.6" fill="none">
      <path d="M22 30 L36 42 L48 38 L62 52 L78 48" />
      <path d="M16 64 L30 58 L42 70 L60 64 L74 76" />
      <path d="M48 38 L42 70" opacity="0.7" />
      <path d="M62 52 L60 64" opacity="0.7" />
    </g>
    <g clipPath="url(#v-c)" fill="#FFB347">
      <circle cx="36" cy="42" r="2.2" />
      <circle cx="62" cy="52" r="2.6" />
      <circle cx="42" cy="70" r="2" />
      <circle cx="74" cy="76" r="1.8" />
    </g>
    <circle cx="50" cy="50" r="46" fill="none" stroke="#FF6B2C" strokeOpacity="0.45" strokeWidth="1" />
  </svg>
);

const PlanetGreen = ({ size = 88 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id="gr-g" cx="38%" cy="35%" r="78%">
        <stop offset="0%" stopColor="#9FE0B5" />
        <stop offset="55%" stopColor="#3E9466" />
        <stop offset="100%" stopColor="#0F3A2A" />
      </radialGradient>
      <clipPath id="gr-c"><circle cx="50" cy="50" r="46" /></clipPath>
    </defs>
    <circle cx="50" cy="50" r="46" fill="url(#gr-g)" />
    <g clipPath="url(#gr-c)" fill="#1F5C42" opacity="0.7">
      <path d="M22 32 q8 -4 16 0 q4 6 -2 12 q-10 2 -14 -4 z" />
      <path d="M55 24 q12 0 18 8 q-2 8 -10 10 q-12 -2 -8 -18 z" />
      <path d="M30 60 q14 -6 26 2 q4 10 -6 14 q-18 4 -20 -16 z" />
      <path d="M70 56 q8 0 10 8 q-2 8 -10 6 q-6 -6 0 -14 z" />
    </g>
    <g clipPath="url(#gr-c)" fill="#FFFFFF" opacity="0.35">
      <ellipse cx="42" cy="40" rx="12" ry="2" />
      <ellipse cx="60" cy="68" rx="10" ry="2" />
    </g>
    <circle cx="50" cy="50" r="46" fill="none" stroke="#0A2418" strokeOpacity="0.6" strokeWidth="1" />
  </svg>
);

const PlanetAnomaly = ({ size = 88 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id="an-g" cx="50%" cy="50%" r="60%">
        <stop offset="0%" stopColor="#E0B0FF" />
        <stop offset="40%" stopColor="#7B3FBF" />
        <stop offset="100%" stopColor="#160826" />
      </radialGradient>
      <radialGradient id="an-glow" cx="50%" cy="50%" r="60%">
        <stop offset="0%" stopColor="#E0B0FF" stopOpacity="0.6" />
        <stop offset="100%" stopColor="#E0B0FF" stopOpacity="0" />
      </radialGradient>
      <clipPath id="an-c"><circle cx="50" cy="50" r="46" /></clipPath>
    </defs>
    <circle cx="50" cy="50" r="48" fill="url(#an-glow)" />
    <circle cx="50" cy="50" r="46" fill="url(#an-g)" />
    <g clipPath="url(#an-c)" stroke="#E0B0FF" strokeWidth="1.2" fill="none" opacity="0.8">
      <path d="M50 8 q-12 22 0 42 q12 20 0 42" />
      <path d="M14 50 q22 -12 42 0 q20 12 42 0" opacity="0.6" />
    </g>
    <circle cx="50" cy="50" r="6" fill="#FFFFFF" opacity="0.85" />
    <circle cx="50" cy="50" r="46" fill="none" stroke="#E0B0FF" strokeOpacity="0.5" strokeWidth="1" />
  </svg>
);

const PLANET_BY_BIOME = {
  rocky: PlanetRocky,
  ocean: PlanetOcean,
  gas_giant: PlanetGasGiant,
  ice: PlanetIce,
  volcanic: PlanetVolcanic,
  green: PlanetGreen,
  anomaly: PlanetAnomaly,
};

// ===========================================================
// BUILDING ICONS — flat 2-tone, 64×64 viewBox
// shared style: thin 1.5 strokes, restrained fills, tinted by `tone`
// ===========================================================

const Icon = ({ size = 36, children, tone = '#5BD7FF' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none"
    stroke={tone} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const IconCommandCenter = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <path d="M16 48 L32 16 L48 48 Z" fill={tone} fillOpacity="0.12" />
    <path d="M22 48 L32 28 L42 48" />
    <circle cx="32" cy="14" r="2.6" fill={tone} />
    <path d="M32 16 L32 11" />
    <path d="M14 52 L50 52" />
    <circle cx="32" cy="40" r="2" fill={tone} />
  </Icon>
);

const IconMine = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <path d="M14 40 L32 18 L50 40 Z" fill={tone} fillOpacity="0.1" />
    <path d="M22 40 L32 28 L42 40" />
    <path d="M10 50 L54 50" />
    <path d="M20 50 L24 40" />
    <path d="M44 50 L40 40" />
    <circle cx="32" cy="44" r="1.8" fill={tone} />
  </Icon>
);

const IconDrill = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <path d="M26 10 L38 10 L36 22 L28 22 Z" fill={tone} fillOpacity="0.15" />
    <path d="M28 22 L36 22 L34 32 L30 32 Z" />
    <path d="M30 32 L34 32 L33 40 L31 40 Z" />
    <path d="M31 40 L33 40 L32 50 Z" />
    <path d="M14 18 L26 18" />
    <path d="M38 18 L50 18" />
    <path d="M14 12 L14 24" />
    <path d="M50 12 L50 24" />
  </Icon>
);

const IconStorage = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <rect x="10" y="36" width="44" height="16" rx="1" fill={tone} fillOpacity="0.12" />
    <rect x="10" y="20" width="44" height="16" rx="1" />
    <path d="M18 20 L18 36" />
    <path d="M32 20 L32 36" />
    <path d="M46 20 L46 36" />
    <path d="M18 36 L18 52" />
    <path d="M32 36 L32 52" />
    <path d="M46 36 L46 52" />
    <circle cx="14" cy="28" r="1.4" fill={tone} />
    <circle cx="14" cy="44" r="1.4" fill={tone} />
  </Icon>
);

const IconSmelter = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <path d="M14 52 L14 28 L26 22 L26 52 Z" fill={tone} fillOpacity="0.12" />
    <rect x="28" y="18" width="22" height="34" rx="1" />
    <path d="M34 18 L34 8" />
    <path d="M44 18 L44 8" />
    <circle cx="34" cy="6" r="2" fill={tone} fillOpacity="0.5" />
    <circle cx="44" cy="6" r="2" fill={tone} fillOpacity="0.5" />
    <path d="M32 38 L46 38" />
    <circle cx="39" cy="44" r="3" fill={tone} fillOpacity="0.4" />
  </Icon>
);

const IconSpaceport = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <path d="M32 8 L36 24 L36 42 L28 42 L28 24 Z" fill={tone} fillOpacity="0.18" />
    <path d="M28 24 L22 30 L22 42 L28 42" />
    <path d="M36 24 L42 30 L42 42 L36 42" />
    <circle cx="32" cy="22" r="1.8" fill={tone} />
    <path d="M14 52 L50 52" />
    <path d="M28 42 L20 52" />
    <path d="M36 42 L44 52" />
  </Icon>
);

const IconShipyard = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <path d="M10 38 L54 38 L48 48 L16 48 Z" fill={tone} fillOpacity="0.15" />
    <path d="M16 38 L16 28 L48 28 L48 38" />
    <path d="M22 28 L22 16 L42 16 L42 28" />
    <path d="M32 16 L32 10" />
    <circle cx="32" cy="9" r="1.4" fill={tone} />
    <path d="M6 38 L10 38" />
    <path d="M54 38 L58 38" />
  </Icon>
);

const IconLab = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <path d="M26 10 L38 10" />
    <path d="M28 10 L28 26 L18 48 Q14 56 22 56 L42 56 Q50 56 46 48 L36 26 L36 10" />
    <path d="M22 40 Q32 36 42 40" fill={tone} fillOpacity="0.18" />
    <circle cx="28" cy="46" r="1.4" fill={tone} />
    <circle cx="36" cy="50" r="1.4" fill={tone} />
  </Icon>
);

const IconCryoFactory = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <circle cx="32" cy="32" r="18" fill={tone} fillOpacity="0.1" />
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

const IconSolarPlant = ({ size, tone }) => (
  <Icon size={size} tone={tone}>
    <circle cx="20" cy="22" r="6" fill={tone} fillOpacity="0.4" />
    <path d="M20 12 L20 8" />
    <path d="M20 32 L20 36" />
    <path d="M10 22 L6 22" />
    <path d="M30 22 L34 22" />
    <path d="M13 15 L10 12" />
    <path d="M27 29 L30 32" />
    <rect x="34" y="34" width="20" height="14" rx="1" fill={tone} fillOpacity="0.15" />
    <path d="M38 34 L38 48" />
    <path d="M44 34 L44 48" />
    <path d="M50 34 L50 48" />
    <path d="M30 52 L58 52" />
    <path d="M44 48 L44 52" />
  </Icon>
);

const BUILDING_BY_TYPE = {
  command_center: { Icon: IconCommandCenter, label: 'Command Center', cat: 'Core' },
  mine:           { Icon: IconMine,          label: 'Mine',           cat: 'Extraction' },
  drill:          { Icon: IconDrill,         label: 'Deep Drill',     cat: 'Extraction' },
  storage:        { Icon: IconStorage,       label: 'Storage',        cat: 'Logistics' },
  smelter:        { Icon: IconSmelter,       label: 'Smelter',        cat: 'Production' },
  spaceport:      { Icon: IconSpaceport,     label: 'Spaceport',      cat: 'Fleet' },
  shipyard:       { Icon: IconShipyard,      label: 'Shipyard',       cat: 'Fleet' },
  lab:            { Icon: IconLab,           label: 'Research Lab',   cat: 'Science' },
  cryo_factory:   { Icon: IconCryoFactory,   label: 'Cryo Factory',   cat: 'Production' },
  solar_plant:    { Icon: IconSolarPlant,    label: 'Solar Plant',    cat: 'Energy' },
};

const BIOME_META = {
  rocky:     { label: 'Rocky',      tag: 'TERRESTRIAL', accent: '#C7A582', hue: 30  },
  ocean:     { label: 'Ocean',      tag: 'AQUATIC',     accent: '#7DD8E8', hue: 195 },
  gas_giant: { label: 'Gas Giant',  tag: 'ATMOSPHERIC', accent: '#E6C58A', hue: 38  },
  ice:       { label: 'Ice',        tag: 'CRYOGENIC',   accent: '#9BC6E0', hue: 210 },
  volcanic:  { label: 'Volcanic',   tag: 'MAGMATIC',    accent: '#FF6B2C', hue: 18  },
  green:     { label: 'Green',      tag: 'BIOTIC',      accent: '#9FE0B5', hue: 150 },
  anomaly:   { label: 'Anomaly',    tag: 'EXOTIC',      accent: '#E0B0FF', hue: 280 },
};

Object.assign(window, {
  PlanetRocky, PlanetOcean, PlanetGasGiant, PlanetIce, PlanetVolcanic,
  PlanetGreen, PlanetAnomaly, PLANET_BY_BIOME, BIOME_META,
  IconCommandCenter, IconMine, IconDrill, IconStorage, IconSmelter,
  IconSpaceport, IconShipyard, IconLab, IconCryoFactory, IconSolarPlant,
  BUILDING_BY_TYPE,
});
