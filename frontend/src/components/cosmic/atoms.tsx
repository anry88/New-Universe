/**
 * Shared Cosmic Atlas atoms — resource chips, planet portrait, build slot,
 * planet rail, queue strip, bottom navigation. These are the pieces that
 * compose the Telegram mini-app screens; they are intentionally dumb so they
 * can be wired up to live API data on each page.
 *
 * Ported from `design-bundle/project/screens.jsx`.
 */
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BIOME_META, PlanetSvg, Stars, getBiomeLabel, getBiomeTag, resolveBiome } from './planets';
import { getBuildingCategory, getBuildingLabel, resolveBuildingType } from './buildings';
import { ResourceIcon } from './resources';
import { useI18n } from '../../lib/i18n';

// --- Resource chip ---------------------------------------------------------

export interface ResourceChipData {
  resourceId: string;
  amount: number;
  cap: number;
  rate: number;
}

export const ResourceChip: React.FC<{ data: ResourceChipData; onClick?: (resourceId: string) => void }> = ({ data, onClick }) => {
  const { t } = useI18n();
  const pct = data.cap > 0 ? Math.min(100, Math.round((data.amount / data.cap) * 100)) : 0;
  const near = pct > 85;
  const clickable = typeof onClick === 'function';
  return (
    <button
      type="button"
      className={'rchip' + (clickable ? ' rchip-clickable' : '')}
      onClick={() => onClick?.(data.resourceId)}
      disabled={!clickable}
      title={clickable ? t('resources.buyWithDiamonds') : undefined}
    >
      <div className="rchip-row">
        <span className="rchip-sym">
          <ResourceIcon resourceId={data.resourceId} size={18} />
        </span>
        <span className="rchip-amt">{Math.floor(data.amount).toLocaleString()}</span>
      </div>
      <div className="rchip-meta">
        <span className={'rchip-rate ' + (data.rate > 0 ? 'pos' : 'zero')}>
          {data.rate > 0 ? `+${data.rate}/h` : '—'}
        </span>
        <div className="rchip-bar">
          <div
            className="rchip-bar-fill"
            style={{ width: pct + '%', background: near ? '#F4B84A' : 'var(--accent)' }}
          />
        </div>
      </div>
    </button>
  );
};

// --- Top bar ---------------------------------------------------------------

export const CosmicTopBar: React.FC<{
  resources: ResourceChipData[];
  diamonds?: number;
  onResourceClick?: (resourceId: string) => void;
  onDiamondsClick?: () => void;
}> = ({
  resources,
  diamonds,
  onResourceClick,
  onDiamondsClick,
}) => {
  const { t } = useI18n();
  return (
    <div className="cosmic-topbar" data-testid="cosmic-topbar">
    <div
      className={
        'cosmic-topbar-inner' + (diamonds !== undefined ? ' cosmic-topbar-inner--with-diamonds' : '')
      }
    >
      {diamonds !== undefined && (
        <button
          type="button"
          className="diamond-chip"
          data-testid="diamond-balance"
          title={t('shop.open')}
          onClick={onDiamondsClick}
        >
          <span className="diamond-chip-sym" aria-hidden>
            ◆
          </span>
          <span className="diamond-chip-amt">{diamonds.toLocaleString()}</span>
        </button>
      )}
      <div className="cosmic-topbar-grid">
        {resources.slice(0, diamonds !== undefined ? 4 : 5).map((r) => (
          <ResourceChip key={r.resourceId} data={r} onClick={onResourceClick} />
        ))}
      </div>
    </div>
  </div>
  );
};

// --- Planet portrait -------------------------------------------------------

export interface PlanetPortraitProps {
  biome: string;
  name: string;
  size: number;
  slots: number;
  slotsUsed: number;
}

export const PlanetPortrait: React.FC<PlanetPortraitProps> = ({
  biome,
  name,
  size,
  slots,
  slotsUsed,
}) => {
  const { locale, t } = useI18n();
  const b = resolveBiome(biome);
  const meta = BIOME_META[b];
  const cls = b === 'gas_giant' ? 'III' : b === 'anomaly' ? 'X' : 'II';
  return (
    <div className="ph" data-testid="planet-portrait">
      <div className="ph-orbit">
        <div
          className="ph-glow"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${meta.accent}40 0%, transparent 60%)`,
          }}
        />
        <div className="ph-planet">
          <PlanetSvg biome={b} size={132} />
        </div>
      </div>
      <div>
        <div className="ph-tag" style={{ color: meta.accent }}>
          <span className="dot" style={{ background: meta.accent }} />
          {getBiomeTag(b, locale)} · {t('planet.class').toUpperCase()} {cls}
        </div>
        <div className="ph-name">{name}</div>
        <div className="ph-sub">
          <span>
            {t('planet.size').toUpperCase()} <b>{size}</b>
          </span>
          <span className="sep">·</span>
          <span>
            {t('planet.slots').toUpperCase()} <b>{slotsUsed}/{slots}</b>
          </span>
          <span className="sep">·</span>
          <span>{getBiomeLabel(b, locale)}</span>
        </div>
      </div>
    </div>
  );
};

// --- Build slot ------------------------------------------------------------

export interface BuildSlotData {
  idx: number;
  typeId?: string | null;
  level?: number;
  building?: boolean;
  etaSec?: number;
  progressPct?: number;
  disabled?: boolean;
  energyStored?: number;
  energyCapacity?: number;
  process?: {
    outputLabel: React.ReactNode;
    etaSec: number;
    progressPct: number;
    paused?: boolean;
    extraCount?: number;
  };
}

const formatEta = (sec: number) => {
  const total = Math.max(0, Math.floor(sec));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
};

export interface BuildSlotProps {
  slot: BuildSlotData;
  biomeAccent: string;
  onClick?: () => void;
}

export const BuildSlot: React.FC<BuildSlotProps> = ({ slot, biomeAccent, onClick }) => {
  const { locale, t } = useI18n();
  if (!slot.typeId) {
    return (
      <button type="button" className="slot empty" onClick={onClick} data-testid={`slot-${slot.idx}`}>
        <div className="slot-plus">+</div>
        <div className="slot-empty-label">{t('build.empty').toUpperCase()}</div>
      </button>
    );
  }
  const def = resolveBuildingType(slot.typeId);
  return (
    <button
      type="button"
      className={'slot filled ' + (slot.building ? 'queued ' : '') + (slot.disabled ? 'disabled' : '')}
      onClick={onClick}
      data-testid={`slot-${slot.idx}`}
    >
      <div className="slot-icon">
        <def.Icon size={32} tone={biomeAccent} />
      </div>
      <div className="slot-name">{getBuildingLabel(slot.typeId, locale)}</div>
      <div className="slot-lvl">
        <span className="lvl-pill">L{slot.level ?? 1}</span>
        <span className="lvl-cat">{getBuildingCategory(slot.typeId, locale).toUpperCase()}</span>
      </div>
      {slot.building && (
        <div className="slot-progress">
          <div className="slot-progress-bar">
            <div
              className="slot-progress-fill"
              style={{ width: (slot.progressPct ?? 64) + '%' }}
            />
          </div>
          <div className="slot-progress-eta">▲ {formatEta(slot.etaSec ?? 0)}</div>
        </div>
      )}
      {!slot.building && slot.disabled && (
        <div className="slot-energy-warning">{t('build.noPower')}</div>
      )}
      {!slot.building && slot.process && (
        <div className={'slot-process' + (slot.process.paused ? ' paused' : '')}>
          <span>{slot.process.outputLabel}</span>
          <span>
            {slot.process.paused ? t('production.paused') : formatEta(slot.process.etaSec)}
            {slot.process.extraCount ? ` +${slot.process.extraCount}` : ''}
          </span>
        </div>
      )}
      {!slot.building && typeof slot.energyStored === 'number' && typeof slot.energyCapacity === 'number' && (
        <div className="slot-energy-charge">
          {t('build.charge')}: {Math.round(slot.energyStored)}/{Math.round(slot.energyCapacity)} E
        </div>
      )}
    </button>
  );
};

// --- Planet rail -----------------------------------------------------------

export interface PlanetRailItem {
  id: string;
  name: string;
  biome: string;
}

export interface PlanetRailProps {
  planets: PlanetRailItem[];
  current: string;
  onSelect?: (id: string) => void;
}

export const PlanetRail: React.FC<PlanetRailProps> = ({ planets, current, onSelect }) => (
  <PlanetRailInner planets={planets} current={current} onSelect={onSelect} />
);

const PlanetRailInner: React.FC<PlanetRailProps> = ({ planets, current, onSelect }) => {
  const { locale } = useI18n();
  return (
    <div className="rail" data-testid="planet-rail">
      {planets.map((p) => {
      const b = resolveBiome(p.biome);
      const active = p.id === current;
      return (
        <button
          key={p.id}
          type="button"
          className={'rail-item ' + (active ? 'active' : '')}
          onClick={() => onSelect?.(p.id)}
        >
          <div className="rail-orb">
            <PlanetSvg biome={b} size={42} uid={p.id} />
          </div>
          <div className="rail-name">{p.name.split(' ')[0]}</div>
          <div className="rail-tag">{getBiomeLabel(b, locale)}</div>
        </button>
      );
    })}
    </div>
  );
};

// --- Queue strip -----------------------------------------------------------

export interface QueueStripProps {
  title: string;
  subtitle?: string;
  etaSec: number;
  progressPct: number;
  hidden?: boolean;
  /** Server-computed rush price in diamonds; omit to hide the rush control. */
  rushCost?: number;
  /** Current diamond balance (for disabling rush). */
  diamondBalance?: number;
  rushBusy?: boolean;
  rushDisabled?: boolean;
  rushLabel?: string;
  rushTitle?: string;
  rushDisabledTitle?: string;
  notEnoughRushTitle?: string;
  onRush?: () => void;
}

export const QueueStrip: React.FC<QueueStripProps> = ({ title, subtitle, etaSec, progressPct, hidden, rushCost, diamondBalance, rushBusy, rushDisabled, rushLabel, rushTitle, rushDisabledTitle, notEnoughRushTitle, onRush }) => {
  const { t } = useI18n();
  if (hidden) return null;
  const showRush = typeof rushCost === 'number' && rushCost > 0 && typeof diamondBalance === 'number' && typeof onRush === 'function';
  const cantAfford = showRush && diamondBalance < rushCost;
  const disabled = Boolean(cantAfford || rushBusy || rushDisabled);

  return (
    <div className="qstrip" data-testid="queue-strip">
      <div className="qstrip-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ color: 'var(--accent)' }}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7 V12 L15 14" />
        </svg>
      </div>
      <div className="qstrip-body">
        <div className="qstrip-title">{title}</div>
        {subtitle && <div className="qstrip-subtitle">{subtitle}</div>}
        <div className="qstrip-bar">
          <div className="qstrip-fill" style={{ width: Math.min(100, Math.max(0, progressPct)) + '%' }} />
        </div>
      </div>
      <div className="qstrip-actions">
        <div className="qstrip-eta">{formatEta(etaSec)}</div>
        {showRush && (
          <button
            type="button"
            className="qstrip-rush"
            data-testid="queue-rush-button"
            disabled={disabled}
            onClick={onRush}
            title={
              rushDisabled
                ? (rushDisabledTitle ?? rushTitle ?? t('build.rushTitle', { cost: rushCost }))
                : cantAfford
                  ? (notEnoughRushTitle ?? t('build.notEnoughDiamonds'))
                  : (rushTitle ?? t('build.rushTitle', { cost: rushCost }))
            }
          >
            {rushBusy ? '…' : `◆ ${rushCost} ${rushLabel ?? t('build.rush')}`}
          </button>
        )}
      </div>
    </div>
  );
};

// --- Bottom nav ------------------------------------------------------------

export type CosmicNavId = 'planets' | 'ships' | 'map' | 'tech' | 'profile';

const NAV_ITEMS: { id: CosmicNavId | 'home'; label: string; route: string; icon: 'planet' | 'ship' | 'map' | 'tech' | 'user' | 'home' }[] = [
  { id: 'home', label: 'nav.home', route: '/', icon: 'home' },
  { id: 'planets', label: 'nav.colonies', route: '/colonies', icon: 'planet' },
  { id: 'ships', label: 'nav.fleet', route: '/ships', icon: 'ship' },
  { id: 'map', label: 'nav.galaxy', route: '/map', icon: 'map' },
  { id: 'tech', label: 'nav.tech', route: '/research', icon: 'tech' },
  { id: 'profile', label: 'nav.profile', route: '/profile', icon: 'user' },
];

const NavIcon: React.FC<{ kind: 'planet' | 'ship' | 'map' | 'tech' | 'user' | 'home'; active: boolean }> = ({
  kind,
  active,
}) => {
  const c = active ? 'var(--text)' : 'var(--text-faint)';
  switch (kind) {
    case 'planet':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6">
          <circle cx="12" cy="12" r="6" />
          <ellipse cx="12" cy="12" rx="11" ry="3.5" transform="rotate(-20 12 12)" />
        </svg>
      );
    case 'ship':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6">
          <path d="M12 3 L15 14 L12 17 L9 14 Z" />
          <path d="M9 14 L5 16 L9 19" />
          <path d="M15 14 L19 16 L15 19" />
        </svg>
      );
    case 'map':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12 H21" />
          <path d="M12 3 Q16 12 12 21" />
          <path d="M12 3 Q8 12 12 21" />
        </svg>
      );
    case 'tech':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 4 V8" />
          <path d="M12 16 V20" />
          <path d="M4 12 H8" />
          <path d="M16 12 H20" />
          <path d="M6.3 6.3 L9 9" />
          <path d="M15 15 L17.7 17.7" />
          <path d="M17.7 6.3 L15 9" />
          <path d="M9 15 L6.3 17.7" />
        </svg>
      );
    case 'user':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6">
          <circle cx="12" cy="9" r="3.5" />
          <path d="M5 21 Q5 14 12 14 Q19 14 19 21" />
        </svg>
      );
    case 'home':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6">
          <path d="M3 10 L12 3 L21 10 V20 H15 V14 H9 V20 H3 Z" />
        </svg>
      );
  }
};

export const CosmicBottomNav: React.FC<{ active?: CosmicNavId | 'home' }> = ({ active }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  // Auto-detect active tab from current route if not provided.
  const detected: CosmicNavId | 'home' =
    active ??
    (location.pathname.startsWith('/ships')
      ? 'ships'
      : location.pathname.startsWith('/sector-map') || location.pathname.startsWith('/map')
        ? 'map'
        : location.pathname.startsWith('/research')
          ? 'tech'
          : location.pathname.startsWith('/profile')
            ? 'profile'
            : location.pathname.startsWith('/colonies')
              ? 'planets'
              : 'home');

  return (
    <nav className="bnav">
      {NAV_ITEMS.map((n) => (
        <button
          key={n.id}
          type="button"
          className={'bnav-item ' + (n.id === detected ? 'active' : '')}
          onClick={() => navigate(n.route)}
          data-testid={`bnav-${n.id}`}
        >
          <NavIcon kind={n.icon} active={n.id === detected} />
          <span className="bnav-label">{t(n.label)}</span>
          {n.id === detected && <span className="bnav-mark" />}
        </button>
      ))}
    </nav>
  );
};

// --- Background -----------------------------------------------------------

export interface CosmicBackgroundProps {
  accent: string;
  starSeed?: number;
  density?: number;
  vignette?: boolean;
}

export const CosmicBackground: React.FC<CosmicBackgroundProps> = ({
  accent,
  starSeed = 7,
  density = 70,
  vignette = true,
}) => (
  <div className="cosmic-bg" style={{ '--accent': accent } as React.CSSProperties}>
    <Stars seed={starSeed} density={density} />
    <div className="cosmic-bg-grad" />
    {vignette && <div className="cosmic-bg-vignette" />}
  </div>
);

// --- Helpers ---------------------------------------------------------------

export { BIOME_META, getBiomeLabel, getBiomeTag, resolveBiome, Stars, type Biome } from './planets';
export { getBuildingCategory, getBuildingLabel, resolveBuildingType, BuildingIcon } from './buildings';
export { getResourceSymbol, getResourceLabel } from './resources';
