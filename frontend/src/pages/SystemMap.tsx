import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe } from '../hooks/useMe';
import { CosmicSystemRenderer } from '../components/cosmic/SystemMap';
import { CosmicBottomNav } from '../components/cosmic/atoms';
import {
  AlertTriangle,
  ChevronLeft,
  Compass,
  Fuel,
  Navigation,
  Package,
  RadioTower,
  Rocket,
  Send,
} from 'lucide-react';
import { formatHomeSystemTitleForUser } from '../lib/homeSystemTitle';
import { useI18n } from '../lib/i18n';
import { useJumpGateState, useRandomJump } from '../hooks/useJumpGateState';
import { useShipTypes } from '../hooks/useShips';
import {
  JUMP_FUEL_RESOURCE_ID,
  JUMP_GATE_JUMP_FUEL_COST,
} from '@shared/config/expeditionRouting';
import type {
  JumpGateKnownDestinationSummary,
  JumpGateStateResponse,
} from '@shared/types/jump-gate';
import type { Ship, ShipType } from '@shared/types/ships';

type TFunction = (key: string, params?: Record<string, string | number>) => string;

interface JumpShipOption {
  ship: Ship;
  type: ShipType | undefined;
  planetName: string;
  jumpFuelAvailable: number;
}

function formatDateTime(value: string | null, locale: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function jumpGateStatusLabel(
  state: JumpGateStateResponse | undefined,
  isLoading: boolean,
  t: TFunction,
) {
  if (isLoading) return t('common.processing');
  if (!state?.unlocked) return t('jumpGate.status.locked');
  return t(`jumpGate.status.${state.calibration.status}`);
}

function formatLockedReason(state: JumpGateStateResponse | undefined, t: TFunction) {
  if (!state?.lockedReason) return t('jumpGate.error.locked');
  if (state.lockedReason.code === 'jump_drive_required') {
    return t('jumpGate.locked.jumpDriveRequired', {
      level: state.lockedReason.requiredResearch?.level ?? 1,
    });
  }
  return t('jumpGate.locked.homeSystemMissing');
}

function formatJumpGateError(message: string, t: TFunction) {
  const normalized = message.toLowerCase();
  if (normalized.includes('not enough jump_fuel')) return t('jumpGate.error.insufficientJumpFuel');
  if (normalized.includes('jump drive research level 1 required')) return t('jumpGate.locked.jumpDriveRequired', { level: 1 });
  if (normalized.includes('jump gate is locked')) return t('jumpGate.error.locked');
  if (normalized.includes('jump gate calibration is still in progress')) return t('jumpGate.random.calibrationInProgress');
  if (normalized.includes('random_jump_cooldown')) return t('jumpGate.error.randomCooldownShort');
  if (normalized.includes('ship state changed')) return t('jumpGate.error.shipChanged');
  return t('jumpGate.error.server', { message });
}

function destinationCounts(destination: JumpGateKnownDestinationSummary) {
  const discovered = destination.planets.filter((planet) => planet.isDiscovered).length;
  const colonies = destination.planets.filter((planet) => planet.isOwnedColony).length;
  const unknown = destination.planets.filter((planet) => !planet.isDiscovered).length;
  const colonizerTargets = destination.planets.filter(
    (planet) => planet.isDiscovered && !planet.isColonized && !planet.isOwnedColony,
  ).length;
  return { discovered, colonies, unknown, colonizerTargets };
}

function destinationOwnedColony(destination: JumpGateKnownDestinationSummary) {
  return destination.planets.find((planet) => planet.isOwnedColony) ?? null;
}

/**
 * Galaxy / system map — Cosmic Atlas chrome around the existing PixiJS
 * renderer. The renderer keeps owning the pan/zoom and orbit visuals; this
 * file just supplies the page header, legend strip, and bottom nav so the
 * screen reads as part of the same product as PlanetDetail / Home.
 */
export function SystemMapPage() {
  const { data: meData, isLoading } = useMe();
  const { data: jumpGateState, isLoading: jumpGateLoading } = useJumpGateState();
  const { data: shipTypes } = useShipTypes();
  const randomJump = useRandomJump();
  const navigate = useNavigate();
  const { locale, t } = useI18n();
  const [isGatePanelOpen, setIsGatePanelOpen] = useState(false);
  const [randomJumpShipId, setRandomJumpShipId] = useState('');
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateNotice, setGateNotice] = useState<string | null>(null);

  const home = meData?.homeSystem ?? null;
  const ownedPlanetIds = useMemo(() => {
    return new Set(
      meData?.planets
        ?.filter((planet) => planet.isColonized !== false)
        .map((planet) => planet.id) ?? [],
    );
  }, [meData?.planets]);
  const homeCapital = useMemo(
    () =>
      meData?.planets?.find(
        (planet) => planet.systemId === home?.id && planet.isColonized !== false,
      ) ??
      meData?.planets?.find((planet) => planet.isColonized !== false) ??
      null,
    [home?.id, meData?.planets],
  );
  const jumpShipOptions = useMemo<JumpShipOption[]>(() => {
    const typeById = new Map((shipTypes ?? []).map((type) => [type.id, type]));
    const planetById = new Map((meData?.planets ?? []).map((planet) => [planet.id, planet]));

    return (meData?.ships ?? []).flatMap((ship) => {
      const type = typeById.get(ship.typeId);
      const supportsRandomJump = ship.typeId === 'jump_ship' || type?.role === 'exploration';
      if (!supportsRandomJump || ship.status !== 'idle' || !ship.locationPlanetId) return [];

      const planet = planetById.get(ship.locationPlanetId);
      const jumpFuelAvailable = Math.floor(
        Number(
          planet?.resources?.find((resource) => resource.resourceId === JUMP_FUEL_RESOURCE_ID)?.amount ??
            0,
        ),
      );

      return [
        {
          ship,
          type,
          planetName: planet?.name ?? t('common.unknown'),
          jumpFuelAvailable,
        },
      ];
    });
  }, [meData?.planets, meData?.ships, shipTypes, t]);
  const selectedJumpShip =
    jumpShipOptions.find((option) => option.ship.id === randomJumpShipId) ??
    jumpShipOptions[0] ??
    null;
  const randomJumpBlockedReason = useMemo(() => {
    if (jumpGateLoading) return t('common.processing');
    if (!jumpGateState) return t('jumpGate.error.loadFailed');
    if (!jumpGateState.unlocked) return formatLockedReason(jumpGateState, t);
    if (jumpGateState.calibration.status === 'calibrating') {
      return t('jumpGate.random.calibrationInProgress');
    }
    if (!jumpGateState.randomJumpAvailability.available) {
      if (
        jumpGateState.randomJumpAvailability.blockedCode === 'random_jump_cooldown' &&
        jumpGateState.randomJumpAvailability.readyAt
      ) {
        return t('jumpGate.error.randomCooldown', {
          time: formatDateTime(jumpGateState.randomJumpAvailability.readyAt, locale),
        });
      }
      return t('jumpGate.error.unavailable');
    }
    if (!selectedJumpShip) return t('jumpGate.error.noJumpShip');
    if (selectedJumpShip.jumpFuelAvailable < JUMP_GATE_JUMP_FUEL_COST) {
      return t('jumpGate.error.insufficientJumpFuel');
    }
    return null;
  }, [jumpGateLoading, jumpGateState, locale, selectedJumpShip, t]);

  useEffect(() => {
    if (jumpShipOptions.length === 0) {
      if (randomJumpShipId) setRandomJumpShipId('');
      return;
    }
    if (!jumpShipOptions.some((option) => option.ship.id === randomJumpShipId)) {
      setRandomJumpShipId(jumpShipOptions[0].ship.id);
    }
  }, [jumpShipOptions, randomJumpShipId]);

  const handleRandomJump = async () => {
    setGateError(null);
    setGateNotice(null);
    if (randomJumpBlockedReason || !selectedJumpShip) {
      setGateError(randomJumpBlockedReason ?? t('jumpGate.error.noJumpShip'));
      return;
    }

    try {
      const result = await randomJump.mutateAsync({ shipId: selectedJumpShip.ship.id });
      setGateNotice(t('jumpGate.random.success', { system: result.targetSystem.name }));
    } catch (err) {
      setGateError(formatJumpGateError(err instanceof Error ? err.message : String(err), t));
    }
  };

  const openDestinationFleet = (destination: JumpGateKnownDestinationSummary) => {
    navigate(`/ships?route=jump_gate&destinationSystemId=${encodeURIComponent(destination.systemId)}`);
  };

  const openDestinationCargo = (destination: JumpGateKnownDestinationSummary) => {
    const colony = destinationOwnedColony(destination);
    if (!homeCapital || !colony) return;
    navigate(
      `/colonies?cargoOrigin=${encodeURIComponent(homeCapital.id)}&cargoTarget=${encodeURIComponent(colony.id)}&cargoRoute=jump_gate`,
    );
  };

  const openDestinationSector = (destination: JumpGateKnownDestinationSummary) => {
    navigate(
      `/sector-map?sx=${destination.sector.x}&sy=${destination.sector.y}&sz=${destination.sector.z}`,
    );
  };

  if (isLoading) {
    return (
      <div className="cosmic-screen" style={{ '--accent': '#5BD7FF', display: 'grid', placeItems: 'center' } as React.CSSProperties}>
        <div className="qstrip-bar" style={{ width: 80 }}>
          <div className="qstrip-fill" style={{ width: '60%' }} />
        </div>
      </div>
    );
  }

  if (!meData?.homeSystem) {
    return (
      <div className="cosmic-screen" style={{ '--accent': '#5BD7FF', display: 'grid', placeItems: 'center' } as React.CSSProperties}>
        <div style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
          <p style={{ marginBottom: 16 }}>{t('map.noHome')}</p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="cosmic-cta"
            style={{ padding: '8px 14px' }}
          >
            {t('common.goBack')}
          </button>
        </div>
      </div>
    );
  }

  const renderedHome = meData.homeSystem;

  return (
    <div className="cosmic-screen" style={{ '--accent': '#5BD7FF', position: 'relative' } as React.CSSProperties}>
      {/* Header overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pointerEvents: 'none',
        }}
      >
        <button
          type="button"
          aria-label={t('common.back')}
          onClick={() => navigate('/')}
          style={{
            padding: 8,
            borderRadius: 999,
            background: 'rgba(14,20,36,0.85)',
            border: '1px solid var(--line)',
            backdropFilter: 'blur(8px)',
            color: 'var(--text)',
            pointerEvents: 'auto',
          }}
        >
          <ChevronLeft size={20} />
        </button>

        <div
          style={{
            background: 'rgba(14,20,36,0.85)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: '8px 14px',
            backdropFilter: 'blur(8px)',
            pointerEvents: 'auto',
            textAlign: 'center',
          }}
        >
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
            {formatHomeSystemTitleForUser(meData)}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: '0.18em',
              color: 'var(--text-faint)',
              marginTop: 2,
            }}
          >
            {t('map.sector').toUpperCase()} {renderedHome.sectorX}:{renderedHome.sectorY}:{renderedHome.sectorZ}
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            navigate(
              `/sector-map?sx=${renderedHome.sectorX}&sy=${renderedHome.sectorY}&sz=${renderedHome.sectorZ}`,
            )
          }
          style={{
            pointerEvents: 'auto',
            borderRadius: 10,
            border: '1px solid var(--line)',
            background: 'rgba(14,20,36,0.85)',
            color: 'var(--accent)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            padding: '8px 10px',
            backdropFilter: 'blur(8px)',
          }}
        >
          {t('map.sector')}
        </button>
      </div>

      {/* SVG/HTML system renderer — uses real biome sprites and a sun.
          The wrapper has explicit positioning so the renderer (which uses
          `position: absolute; inset: 0`) gets a deterministic frame even
          when the parent flex container measures awkwardly. */}
      <div
        style={{
          flex: '1 1 auto',
          position: 'relative',
          minHeight: 0,
          width: '100%',
          // Reserve space for the bottom nav (~64px) so the renderer doesn't
          // hide behind it on short viewports.
          height: 'calc(100vh - 64px)',
        }}
      >
        <CosmicSystemRenderer
          system={renderedHome}
          ships={meData.ships || []}
          expeditions={meData.expeditions || []}
          onPlanetClick={(planet) => navigate(`/planet/${planet.id}`)}
          onColonizeClick={() => navigate('/ships')}
          ownedPlanetIds={ownedPlanetIds}
          jumpGate={{
            unlocked: Boolean(jumpGateState?.unlocked),
            statusLabel: jumpGateStatusLabel(jumpGateState, jumpGateLoading, t),
            onClick: () => setIsGatePanelOpen(true),
          }}
        />
      </div>

      {isGatePanelOpen ? (
        <JumpGatePanel
          state={jumpGateState}
          isLoading={jumpGateLoading}
          jumpShipOptions={jumpShipOptions}
          selectedShipId={randomJumpShipId}
          onSelectShip={setRandomJumpShipId}
          randomJumpBlockedReason={randomJumpBlockedReason}
          isRandomJumpPending={randomJump.isPending}
          gateError={gateError}
          gateNotice={gateNotice}
          locale={locale}
          t={t}
          onRandomJump={handleRandomJump}
          onClose={() => setIsGatePanelOpen(false)}
          onOpenFleet={openDestinationFleet}
          onOpenCargo={openDestinationCargo}
          onOpenSector={openDestinationSector}
        />
      ) : null}

      <CosmicBottomNav />
    </div>
  );
}

interface JumpGatePanelProps {
  state: JumpGateStateResponse | undefined;
  isLoading: boolean;
  jumpShipOptions: JumpShipOption[];
  selectedShipId: string;
  onSelectShip: (shipId: string) => void;
  randomJumpBlockedReason: string | null;
  isRandomJumpPending: boolean;
  gateError: string | null;
  gateNotice: string | null;
  locale: string;
  t: TFunction;
  onRandomJump: () => void;
  onClose: () => void;
  onOpenFleet: (destination: JumpGateKnownDestinationSummary) => void;
  onOpenCargo: (destination: JumpGateKnownDestinationSummary) => void;
  onOpenSector: (destination: JumpGateKnownDestinationSummary) => void;
}

function JumpGatePanel({
  state,
  isLoading,
  jumpShipOptions,
  selectedShipId,
  onSelectShip,
  randomJumpBlockedReason,
  isRandomJumpPending,
  gateError,
  gateNotice,
  locale,
  t,
  onRandomJump,
  onClose,
  onOpenFleet,
  onOpenCargo,
  onOpenSector,
}: JumpGatePanelProps) {
  const selectedShip =
    jumpShipOptions.find((option) => option.ship.id === selectedShipId) ??
    jumpShipOptions[0] ??
    null;
  const destinations = state?.knownDestinations ?? [];

  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 82,
        zIndex: 30,
        maxHeight: 'min(72dvh, 680px)',
        overflowY: 'auto',
        border: '1px solid rgba(91,215,255,0.28)',
        borderRadius: 16,
        background: 'linear-gradient(180deg, rgba(8,12,22,0.96), rgba(10,18,32,0.94))',
        boxShadow: '0 22px 70px rgba(0,0,0,0.42)',
        backdropFilter: 'blur(14px)',
        padding: 14,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--accent)',
              fontSize: 10,
              letterSpacing: '0.14em',
              fontWeight: 800,
            }}
          >
            {t('jumpGate.panel.tag').toUpperCase()}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', color: 'var(--text)', fontSize: 18, fontWeight: 700 }}>
            {t('jumpGate.title')}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 3 }}>
            {jumpGateStatusLabel(state, isLoading, t)}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          style={{
            border: '1px solid var(--line)',
            borderRadius: 999,
            background: 'rgba(14,20,36,0.86)',
            color: 'var(--text-dim)',
            padding: '8px 10px',
          }}
        >
          {t('common.close')}
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 10,
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          marginTop: 14,
        }}
      >
        <div
          style={{
            border: '1px solid var(--line)',
            borderRadius: 12,
            background: 'rgba(14,20,36,0.72)',
            padding: 12,
            minWidth: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', fontWeight: 800, fontSize: 13 }}>
            <Rocket size={16} color="var(--accent)" />
            {t('jumpGate.random.action')}
          </div>
          <div style={{ marginTop: 10 }}>
            <select
              value={selectedShip?.ship.id ?? ''}
              onChange={(event) => onSelectShip(event.target.value)}
              disabled={jumpShipOptions.length === 0}
              style={{
                width: '100%',
                minWidth: 0,
                border: '1px solid var(--line)',
                borderRadius: 10,
                background: 'rgba(5,8,17,0.86)',
                color: 'var(--text)',
                padding: '8px 10px',
                fontSize: 12,
              }}
            >
              {jumpShipOptions.length === 0 ? (
                <option value="">{t('jumpGate.random.noShipOption')}</option>
              ) : (
                jumpShipOptions.map((option) => (
                  <option key={option.ship.id} value={option.ship.id}>
                    {(option.type?.name[locale as 'en' | 'ru'] ?? option.ship.typeId)} · {option.planetName}
                  </option>
                ))
              )}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, color: 'var(--text-dim)', fontSize: 11 }}>
            <Fuel size={14} />
            {t('jumpGate.random.jumpFuel', {
              available: selectedShip?.jumpFuelAvailable ?? 0,
              required: JUMP_GATE_JUMP_FUEL_COST,
            })}
          </div>
          <button
            type="button"
            disabled={isRandomJumpPending || Boolean(randomJumpBlockedReason)}
            onClick={onRandomJump}
            style={{
              width: '100%',
              marginTop: 10,
              border: 'none',
              borderRadius: 12,
              padding: '11px 12px',
              background:
                isRandomJumpPending || randomJumpBlockedReason
                  ? 'rgba(51,65,85,0.75)'
                  : 'linear-gradient(135deg, #0891b2, #2563eb)',
              color: isRandomJumpPending || randomJumpBlockedReason ? 'var(--text-faint)' : '#fff',
              fontWeight: 900,
              fontSize: 12,
              cursor: isRandomJumpPending || randomJumpBlockedReason ? 'not-allowed' : 'pointer',
            }}
          >
            {isRandomJumpPending ? t('common.processing') : t('jumpGate.random.action')}
          </button>
          {randomJumpBlockedReason ? (
            <div style={{ marginTop: 8, color: '#fbbf24', fontSize: 11, lineHeight: 1.35 }}>
              {randomJumpBlockedReason}
            </div>
          ) : null}
        </div>

        <div
          style={{
            border: '1px solid var(--line)',
            borderRadius: 12,
            background: 'rgba(14,20,36,0.58)',
            padding: 12,
            minWidth: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', fontWeight: 800, fontSize: 13 }}>
            <RadioTower size={16} color="var(--accent)" />
            {t('jumpGate.destinations.known')}
          </div>
          <div style={{ marginTop: 10, color: 'var(--text-dim)', fontSize: 12 }}>
            {destinations.length === 0
              ? t('jumpGate.destinations.empty')
              : t('jumpGate.destinations.count', { count: destinations.length })}
          </div>
          {!state?.unlocked ? (
            <div style={{ display: 'flex', gap: 8, color: '#fbbf24', fontSize: 11, lineHeight: 1.35, marginTop: 10 }}>
              <AlertTriangle size={15} />
              <span>{formatLockedReason(state, t)}</span>
            </div>
          ) : null}
        </div>
      </div>

      {gateError || gateNotice ? (
        <div
          style={{
            marginTop: 10,
            border: `1px solid ${gateError ? 'rgba(248,113,113,0.45)' : 'rgba(91,215,255,0.35)'}`,
            borderRadius: 12,
            background: gateError ? 'rgba(127,29,29,0.24)' : 'rgba(8,145,178,0.13)',
            color: gateError ? '#fecaca' : '#bfdbfe',
            padding: '9px 10px',
            fontSize: 12,
            lineHeight: 1.35,
          }}
        >
          {gateError ?? gateNotice}
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {destinations.map((destination) => {
          const counts = destinationCounts(destination);
          const colony = destinationOwnedColony(destination);
          const canScout = counts.unknown > 0;
          const canColonize = counts.colonizerTargets > 0;
          const canCargo = Boolean(colony);
          return (
            <div
              key={destination.systemId}
              style={{
                border: '1px solid rgba(148,163,184,0.22)',
                borderRadius: 12,
                background: 'rgba(5,8,17,0.74)',
                padding: 12,
                minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--text)', fontWeight: 900, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {destination.systemName}
                  </div>
                  <div style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontSize: 10, marginTop: 3 }}>
                    [{destination.sector.x}, {destination.sector.y}, {destination.sector.z}]
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenSector(destination)}
                  style={{
                    flex: '0 0 auto',
                    border: '1px solid var(--line)',
                    borderRadius: 999,
                    background: 'rgba(14,20,36,0.76)',
                    color: 'var(--accent)',
                    padding: '7px 9px',
                  }}
                  aria-label={t('jumpGate.destination.actions.sector')}
                >
                  <Navigation size={15} />
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                <GateBadge icon={<Package size={12} />} text={t('jumpGate.destination.badgeColony', { count: counts.colonies })} />
                <GateBadge icon={<Compass size={12} />} text={t('jumpGate.destination.badgeDiscovered', { count: counts.discovered })} />
                <GateBadge
                  icon={<Send size={12} />}
                  text={
                    destination.lastVisitedAt
                      ? t('jumpGate.destination.badgeLastVisited', {
                          time: formatDateTime(destination.lastVisitedAt, locale),
                        })
                      : t('jumpGate.destination.badgeNeverVisited')
                  }
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7, marginTop: 10 }}>
                <DestinationActionButton
                  disabled={!canScout}
                  label={t('jumpGate.destination.actions.scout')}
                  blockedLabel={t('jumpGate.destination.blocked.noSurvey')}
                  onClick={() => onOpenFleet(destination)}
                />
                <DestinationActionButton
                  disabled={!canColonize}
                  label={t('jumpGate.destination.actions.colonize')}
                  blockedLabel={t('jumpGate.destination.blocked.noColonize')}
                  onClick={() => onOpenFleet(destination)}
                />
                <DestinationActionButton
                  disabled={!canCargo}
                  label={t('jumpGate.destination.actions.cargo')}
                  blockedLabel={t('jumpGate.destination.blocked.noCargo')}
                  onClick={() => onOpenCargo(destination)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GateBadge({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        minWidth: 0,
        border: '1px solid rgba(148,163,184,0.2)',
        borderRadius: 999,
        background: 'rgba(14,20,36,0.66)',
        color: 'var(--text-dim)',
        padding: '5px 7px',
        fontSize: 10,
        lineHeight: 1.1,
      }}
    >
      {icon}
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{text}</span>
    </span>
  );
}

function DestinationActionButton({
  disabled,
  label,
  blockedLabel,
  onClick,
}: {
  disabled: boolean;
  label: string;
  blockedLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? blockedLabel : label}
      style={{
        minHeight: 38,
        border: '1px solid var(--line)',
        borderRadius: 10,
        background: disabled ? 'rgba(51,65,85,0.46)' : 'rgba(14,165,233,0.13)',
        color: disabled ? 'var(--text-faint)' : 'var(--accent)',
        fontWeight: 900,
        fontSize: 10,
        lineHeight: 1.12,
        padding: '7px 6px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        overflowWrap: 'anywhere',
      }}
    >
      {disabled ? blockedLabel : label}
    </button>
  );
}
