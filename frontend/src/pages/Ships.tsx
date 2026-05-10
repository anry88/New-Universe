import React, { useState } from 'react';
import { useMe } from '../hooks/useMe';
import { useShipTypes } from '../hooks/useShips';
import { ExpeditionDialog } from '../components/ExpeditionDialog';
import { ResourceBar } from '../components/ResourceBar';
import { CosmicBackground, CosmicBottomNav } from '../components/cosmic/atoms';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Ship } from '@shared/types/ships';

const SHIP_CLASS_TAG: Record<string, string> = {
  scout: 'SCOUT',
  cargo: 'CARGO',
  colonizer: 'COLONIZE',
  jump: 'JUMP',
  fighter: 'COMBAT',
};

/**
 * Fleet roster — Cosmic Atlas redesign.
 *
 * Each ship is a single grid row with a class tag, name + status row, HP/Fuel
 * stats, and a Send Mission button. The list is rendered inside the screen's
 * standard scroll container; bottom navigation and resource bar provide the
 * shared chrome.
 */
export function ShipsPage() {
  const { data: meData } = useMe();
  const { data: shipTypes } = useShipTypes();
  const navigate = useNavigate();
  const [selectedShip, setSelectedShip] = useState<Ship | null>(null);

  const ships = meData?.ships || [];
  const origin = meData?.homeSystem || { sectorX: 0, sectorY: 0, sectorZ: 0 };
  const homePlanetId = meData?.homeSystem?.planets?.[0]?.id;

  const getShipType = (typeId: string) => shipTypes?.find((t) => t.id === typeId);

  return (
    <div className="cosmic-screen" style={{ '--accent': '#5BD7FF' } as React.CSSProperties}>
      <CosmicBackground accent="#5BD7FF" starSeed={11} />

      <ResourceBar planetId={homePlanetId} />

      <div className="page-head" style={{ position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            aria-label="Back"
            onClick={() => navigate('/')}
            style={{ padding: 4, borderRadius: 999, color: 'var(--text-dim)' }}
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <div className="page-tag">FLEET COMMAND</div>
            <div className="page-title">Fleet Roster</div>
          </div>
        </div>
        <div className="page-stat">
          <div className="ps-v">{ships.length}</div>
          <div className="ps-l">VESSELS</div>
        </div>
      </div>

      <div className="cosmic-scroll">
        <div className="ship-list">
          {ships.length === 0 && (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: 'var(--text-faint)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                letterSpacing: '0.1em',
                border: '1px dashed var(--line-strong)',
                borderRadius: 12,
              }}
            >
              NO SHIPS — BUILD THEM IN THE SHIPYARD
            </div>
          )}

          {ships.map((ship) => {
            const type = getShipType(ship.typeId);
            const isIdle = ship.status === 'idle';
            const cls = SHIP_CLASS_TAG[ship.typeId.toLowerCase()] ?? ship.typeId.slice(0, 6).toUpperCase();
            const location = isIdle
              ? `Orbit · ${origin.sectorX}:${origin.sectorY}:${origin.sectorZ}`
              : `In transit · ${ship.status}`;
            return (
              <div key={ship.id} className="ship-row">
                <div className="ship-cls">{cls}</div>
                <div>
                  <div className="ship-name">{type?.name?.en ?? ship.typeId}</div>
                  <div className="ship-loc">{location}</div>
                  <button
                    type="button"
                    disabled={!isIdle}
                    onClick={() => setSelectedShip(ship)}
                    className="cosmic-cta"
                    style={{
                      marginTop: 6,
                      padding: '6px 12px',
                      fontSize: 11,
                      opacity: isIdle ? 1 : 0.4,
                      cursor: isIdle ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {isIdle ? 'SEND MISSION' : 'IN TRANSIT'}
                  </button>
                </div>
                <div className="ship-stats">
                  <div className="ship-stat">
                    <span>HP</span>
                    <b>{type?.armor ?? 0}</b>
                  </div>
                  <div className="ship-stat">
                    <span>SPD</span>
                    <b>{type?.speed ?? 0}</b>
                  </div>
                </div>
              </div>
            );
          })}
          
        </div>
      </div>

      <CosmicBottomNav />

      {selectedShip && getShipType(selectedShip.typeId) && (
        <ExpeditionDialog
          ship={selectedShip}
          shipType={getShipType(selectedShip.typeId)!}
          originX={Number(origin.sectorX)}
          originY={Number(origin.sectorY)}
          originZ={Number(origin.sectorZ)}
          onClose={() => setSelectedShip(null)}
        />
      )}
    </div>
  );
}
