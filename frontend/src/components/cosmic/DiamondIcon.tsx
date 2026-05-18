/**
 * Premium diamond currency icon. Shares the halo + crystal silhouette of the
 * gameplay resource icons so the premium currency reads as part of the same
 * visual family wherever it appears (shop, tutorial, rush buttons).
 */
import React from 'react';

export interface DiamondIconProps {
  size?: number;
  className?: string;
  title?: string;
}

export function DiamondIcon({ size = 18, className, title }: DiamondIconProps): React.ReactElement {
  const gid = React.useId();
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      focusable={false}
      style={{ flex: '0 0 auto' }}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={`${gid}-face`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f3e6ff" />
          <stop offset="48%" stopColor="#c79bff" />
          <stop offset="100%" stopColor="#7c4ddc" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill="#7c5cd6" opacity="0.22" />
      <path
        d="M16 5 25 14 16 27 7 14 16 5Z"
        fill={`url(#${gid}-face)`}
        stroke="#ecdcff"
        strokeWidth="1.45"
        strokeLinejoin="round"
      />
      <path
        d="M16 5v22M7 14h18M11 10l5 4 5-4"
        fill="none"
        stroke="#f6edff"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.66"
      />
    </svg>
  );
}
