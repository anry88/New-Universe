import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe } from '../hooks/useMe';
import { apiFetch } from '../lib/api';
import type { PlanetResource } from '@shared/types/world';
import { CosmicTopBar, type ResourceChipData } from './cosmic/atoms';
import { calculateRegen } from './cosmic/resources';
import { planetInventoryApiPath } from '../lib/resourceBarScope';
import { ResourceInventoryDrawer, type InventoryRow } from './ResourceInventoryDrawer';
import { ResourceDiamondPurchaseDialog } from './ResourceDiamondPurchaseDialog';
import { useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../lib/i18n';
import type { User } from '@shared/types/user';

interface ResourceBarProps {
  planetId?: string;
  /** Planet name for the inventory header when switching focal planet from the rail. */
  planetLabel?: string;
}

interface ResourceWithAmount extends PlanetResource {
  currentAmount: number;
  targetAmount: number;
}

const TOP_BAR_RESOURCE_PRIORITY = ['iron', 'silicon', 'carbon'] as const;

export function orderTopBarResources<T extends { resourceId: string }>(rows: T[]): T[] {
  const priorityRank = new Map<string, number>(
    TOP_BAR_RESOURCE_PRIORITY.map((resourceId, index) => [resourceId, index]),
  );

  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const aRank = priorityRank.get(a.row.resourceId.toLowerCase());
      const bRank = priorityRank.get(b.row.resourceId.toLowerCase());
      if (aRank !== undefined || bRank !== undefined) {
        return (aRank ?? Number.MAX_SAFE_INTEGER) - (bRank ?? Number.MAX_SAFE_INTEGER);
      }
      return a.index - b.index;
    })
    .map(({ row }) => row);
}

/**
 * Cosmic Atlas resource bar: prioritized visible resources plus a full inventory sheet.
 *
 * With `planetId`, loads `planetInventoryApiPath(id)` so amounts match that planet.
 * Without `planetId`, falls back to the home planet snapshot from `/me`.
 */
export function ResourceBar({ planetId, planetLabel }: ResourceBarProps) {
  const { data: meData } = useMe();
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const diamondBalance = meData?.diamonds;
  const [resources, setResources] = useState<ResourceWithAmount[]>([]);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseResourceId, setPurchaseResourceId] = useState<string | null>(null);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const tickRef = useRef<number | undefined>(undefined);
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
      if (document.visibilityState === 'hidden') {
        lastUpdateRef.current = Date.now();
        return;
      }

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

    };

    tickRef.current = window.setInterval(animate, 1000);
    return () => {
      if (tickRef.current !== undefined) {
        window.clearInterval(tickRef.current);
      }
    };
  }, []);

  const topBarResources = useMemo(() => orderTopBarResources(resources), [resources]);

  const data: ResourceChipData[] = topBarResources.map((r) => ({
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
    t('colonies.planetSingular');

  const selectedPlanetId = planetId || meData?.homeSystem?.planets?.[0]?.id;

  const purchaseAvailableSpace = useMemo(() => {
    if (!purchaseResourceId) return null;
    const res = resources.find((r) => r.resourceId === purchaseResourceId);
    if (!res) return null;
    const storageCap = parseFloat(String(res.storageCap));
    return Math.max(0, storageCap - res.currentAmount);
  }, [purchaseResourceId, resources]);

  const openPurchase = (resourceId: string) => {
    setPurchaseResourceId(resourceId);
    setPurchaseOpen(true);
  };

  const handlePurchase = async (amount: number) => {
    if (!purchaseResourceId || !selectedPlanetId) return;
    setPurchaseBusy(true);
    try {
      const result = await apiFetch<{
        resourceId: string;
        amount: number;
        diamondsSpent: number;
        diamondsRemaining: number;
      }>('/resources/buy-with-diamonds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planetId: selectedPlanetId,
          resourceId: purchaseResourceId,
          amount,
        }),
      });
      setResources((prev) =>
        prev.map((resource) => {
          if (resource.resourceId !== result.resourceId) return resource;
          const storageCap = parseFloat(String(resource.storageCap));
          const nextAmount = Math.min(
            storageCap,
            resource.currentAmount + result.amount,
          );
          return {
            ...resource,
            currentAmount: nextAmount,
            targetAmount: nextAmount,
            amount: nextAmount.toString(),
          };
        }),
      );
      queryClient.setQueryData<User>(['me'], (old) =>
        old ? { ...old, diamonds: result.diamondsRemaining } : old,
      );
      void fetchResources();
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      setPurchaseOpen(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t('resources.failedBuy'));
    } finally {
      setPurchaseBusy(false);
    }
  };

  if (data.length === 0) {
    return (
      <>
        <div className="cosmic-resource-strip">
          <CosmicTopBar
            diamonds={diamondBalance}
            onDiamondsClick={() => navigate('/shop')}
            onResourceClick={selectedPlanetId ? openPurchase : undefined}
            trailingAction={
              <button
                type="button"
                className="resource-bar-all-btn"
                disabled
                aria-disabled="true"
              >
                {t('common.all')}
              </button>
            }
            resources={[
              { resourceId: 'iron', amount: 0, cap: 1000, rate: 0 },
              { resourceId: 'silicon', amount: 0, cap: 1000, rate: 0 },
              { resourceId: 'carbon', amount: 0, cap: 1000, rate: 0 },
              { resourceId: 'water', amount: 0, cap: 1000, rate: 0 },
              { resourceId: 'methane', amount: 0, cap: 1000, rate: 0 },
            ]}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="cosmic-resource-strip">
        <CosmicTopBar
          resources={data}
          diamonds={diamondBalance}
          onDiamondsClick={() => navigate('/shop')}
          onResourceClick={selectedPlanetId ? openPurchase : undefined}
          trailingAction={
            <button
              type="button"
              className="resource-bar-all-btn"
              data-testid="resource-bar-all"
              onClick={() => setInventoryOpen(true)}
              aria-expanded={inventoryOpen}
            >
              {t('common.all')}
            </button>
          }
        />
      </div>
      <ResourceInventoryDrawer
        open={inventoryOpen}
        onClose={() => setInventoryOpen(false)}
        planetTitle={titlePlanet}
        rows={inventoryRows}
        diamondBalance={diamondBalance}
        onResourceClick={selectedPlanetId ? openPurchase : undefined}
      />
      <ResourceDiamondPurchaseDialog
        open={purchaseOpen}
        planetId={selectedPlanetId ?? null}
        resourceId={purchaseResourceId}
        diamondBalance={diamondBalance ?? 0}
        availableSpace={purchaseAvailableSpace}
        busy={purchaseBusy}
        onClose={() => setPurchaseOpen(false)}
        onConfirm={handlePurchase}
      />
    </>
  );
}
