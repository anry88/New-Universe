import { useState, useEffect, useRef, useCallback } from 'react';
import { useMe } from '../hooks/useMe';
import { apiFetch } from '../lib/api';
import type { PlanetResource } from '@shared/types/world';
import { CosmicTopBar, type ResourceChipData } from './cosmic/atoms';
import { calculateRegen } from './cosmic/resources';
import { planetInventoryApiPath } from '../lib/resourceBarScope';
import { ResourceInventoryDrawer, type InventoryRow } from './ResourceInventoryDrawer';

interface ResourceBarProps {
  planetId?: string;
  /** Planet name for the inventory header when switching focal planet from the rail. */
  planetLabel?: string;
}

interface ResourceWithAmount extends PlanetResource {
  currentAmount: number;
  targetAmount: number;
}

/**
 * Cosmic Atlas resource bar: top five resources plus an optional full inventory sheet.
 *
 * With `planetId`, loads `planetInventoryApiPath(id)` so amounts match that planet.
 * Without `planetId`, falls back to the home planet snapshot from `/me`.
 */
export function ResourceBar({ planetId, planetLabel }: ResourceBarProps) {
  const { data: meData } = useMe();
  const diamondBalance = meData?.diamonds;
  const [resources, setResources] = useState<ResourceWithAmount[]>([]);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const animationRef = useRef<number | undefined>(undefined);
  const lastUpdateRef = useRef<number>(Date.now());

  const fetchResources = useCallback(async () => {
    if (planetId) {
      try {
        const data = await apiFetch<{ resources: PlanetResource[] }>(planetInventoryApiPath(planetId));
        setResources(
          data.resources.map((r) => ({
            ...r,
            currentAmount: typeof r.amount === 'number' ? r.amount : parseFloat(String(r.amount)),
            targetAmount: typeof r.amount === 'number' ? r.amount : parseFloat(String(r.amount)),
          })),
        );
        return;
      } catch (err) {
        console.error('Failed to fetch resources for planet:', planetId, err);
        /* fall through */
      }
    }

    if (meData?.homeSystem?.planets?.[0]?.resources) {
      const mockResources = meData.homeSystem.planets[0].resources;
      setResources(
        mockResources.map((r) => ({
          ...r,
          currentAmount: parseFloat(String(r.amount)),
          targetAmount: parseFloat(String(r.amount)),
        })),
      );
    }
  }, [planetId, meData]);

  useEffect(() => {
    lastUpdateRef.current = Date.now();
    void fetchResources();
  }, [fetchResources]);

  useEffect(() => {
    const animate = () => {
      const now = Date.now();
      const deltaSeconds = (now - lastUpdateRef.current) / 1000;
      lastUpdateRef.current = now;

      setResources((prev) =>
        prev.map((r) => {
          const regenRate = parseFloat(String(r.regenRate));
          const storageCap = parseFloat(String(r.storageCap));
          const newAmount = calculateRegen(r.currentAmount, regenRate, deltaSeconds, storageCap);
          return {
            ...r,
            currentAmount: newAmount,
          };
        }),
      );

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current !== undefined) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const data: ResourceChipData[] = resources.slice(0, 5).map((r) => ({
    resourceId: r.resourceId,
    amount: r.currentAmount,
    cap: parseFloat(String(r.storageCap)),
    rate: Math.round(parseFloat(String(r.regenRate))),
  }));

  const inventoryRows: InventoryRow[] = resources.map((r) => ({
    resourceId: r.resourceId,
    amount: r.currentAmount,
    cap: parseFloat(String(r.storageCap)),
    ratePerHour: parseFloat(String(r.regenRate)),
  }));

  const titlePlanet =
    planetLabel?.trim() ||
    meData?.homeSystem?.planets?.[0]?.name ||
    'Planet';

  if (data.length === 0) {
    return (
      <>
        <div className="cosmic-resource-strip">
          <CosmicTopBar
            resources={[
              { resourceId: 'water', amount: 0, cap: 1000, rate: 0 },
              { resourceId: 'iron', amount: 0, cap: 1000, rate: 0 },
              { resourceId: 'silicon', amount: 0, cap: 1000, rate: 0 },
              { resourceId: 'methane', amount: 0, cap: 1000, rate: 0 },
              { resourceId: 'tritium', amount: 0, cap: 1000, rate: 0 },
            ]}
          />
          <button
            type="button"
            className="resource-bar-all-btn"
            disabled
            aria-disabled="true"
          >
            All
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="cosmic-resource-strip">
        <CosmicTopBar resources={data} />
        <button
          type="button"
          className="resource-bar-all-btn"
          data-testid="resource-bar-all"
          onClick={() => setInventoryOpen(true)}
          aria-expanded={inventoryOpen}
        >
          All
        </button>
      </div>
      <ResourceInventoryDrawer
        open={inventoryOpen}
        onClose={() => setInventoryOpen(false)}
        planetTitle={titlePlanet}
        rows={inventoryRows}
        diamondBalance={diamondBalance}
      />
    </>
  );
}
