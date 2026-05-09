/**
 * Cosmic Atlas star sprite — used as the system center on the galaxy map.
 * Pure SVG (gradient + rays + glow halo); slowly rotates the rays via CSS.
 */
import React from 'react';

export interface SunSvgProps {
  size?: number;
}

export const SunSvg: React.FC<SunSvgProps> = ({ size = 96 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    style={{
      filter: 'drop-shadow(0 0 12px rgba(255,210,120,0.55))',
      animation: 'sunSpin 80s linear infinite',
      willChange: 'transform',
    }}
  >
    <defs>
      <radialGradient id="sun-glow" cx="50%" cy="50%" r="55%">
        <stop offset="0%" stopColor="#FFE9A6" stopOpacity="0.85" />
        <stop offset="60%" stopColor="#FFB347" stopOpacity="0.25" />
        <stop offset="100%" stopColor="#FF6B2C" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="sun-core" cx="40%" cy="38%" r="60%">
        <stop offset="0%" stopColor="#FFF6D8" />
        <stop offset="55%" stopColor="#FFC85A" />
        <stop offset="100%" stopColor="#E0681A" />
      </radialGradient>
    </defs>
    {/* outer halo */}
    <circle cx="50" cy="50" r="48" fill="url(#sun-glow)" />
    {/* rays */}
    <g stroke="#FFC85A" strokeWidth="1.2" strokeLinecap="round" opacity="0.55">
      <line x1="50" y1="6" x2="50" y2="14" />
      <line x1="50" y1="86" x2="50" y2="94" />
      <line x1="6" y1="50" x2="14" y2="50" />
      <line x1="86" y1="50" x2="94" y2="50" />
      <line x1="18" y1="18" x2="24" y2="24" />
      <line x1="76" y1="76" x2="82" y2="82" />
      <line x1="82" y1="18" x2="76" y2="24" />
      <line x1="18" y1="82" x2="24" y2="76" />
    </g>
    {/* core */}
    <circle cx="50" cy="50" r="22" fill="url(#sun-core)" />
    <circle cx="50" cy="50" r="22" fill="none" stroke="#FF8C2A" strokeOpacity="0.5" strokeWidth="0.8" />
    {/* surface flecks */}
    <g fill="#E0681A" opacity="0.55">
      <circle cx="44" cy="46" r="1.4" />
      <circle cx="56" cy="52" r="1" />
      <circle cx="50" cy="58" r="1.2" />
    </g>
  </svg>
);
