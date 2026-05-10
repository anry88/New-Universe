import { useState, useEffect, useRef, useCallback } from 'react';
import { useMe } from '../hooks/useMe';
import { apiFetch } from '../lib/api';
import type { PlanetResource } from '@shared/types/world';
import { CosmicTopBar, type ResourceChipData } from './cosmic/atoms';
import { calculateRegen } from './cosmic/resources';

interface ResourceBarProps {
  planetId?: string;
}

interface ResourceWithAmount extends PlanetResource {
  currentAmount: number;
  targetAmount: number;
}

/**
 * Cosmic Atlas resource bar. Renders the top 5 resources as the design
 * specifies: monospace symbol, amount, +/h rate and a fill bar that turns
 * amber when capacity is almost reached.
 *
 * Behavior preserved from the legacy implementation:
 *  - Lazy fetch from `/planets/{id}/resources` when a planet id is supplied;
 *    otherwise fall back to the home planet payload returned by `/me`.
 *  - Smooth in-UI accrual via requestAnimationFrame using the resource regen
 *    rate so the displayed number ticks up between API calls.
 */
export function ResourceBar({ planetId }: ResourceBarProps) {
  const { data: meData } = useMe();
  const [resources, setResources] = useState<ResourceWithAmount[]>([]);
  const animationRef = useRef<number | undefined>(undefined);
  const lastUpdateRef = useRef<number>(Date.now());

  const fetchResources = useCallback(async () => {
    if (planetId) {
      try {
        const data = await apiFetch<{ resources: PlanetResource[] }>(
          `/resources/planets/${planetId}`
        );
        setResources(
          data.resources.map((r) => ({
            ...r,
            currentAmount: typeof r.amount === 'number' ? r.amount : parseFloat(r.amount),
            targetAmount: typeof r.amount === 'number' ? r.amount : parseFloat(r.amount),
          }))
        );
        return;
      } catch (err) {
        console.error('Failed to fetch resources for planet:', planetId, err);
        /* fall through to mock */
      }
    }

    if (meData?.homeSystem?.planets?.[0]?.resources) {
      const mockResources = meData.homeSystem.planets[0].resources;
      setResources(
        mockResources.map((r) => ({
          ...r,
          currentAmount: parseFloat(r.amount),
          targetAmount: parseFloat(r.amount),
        }))
      );
    }
  }, [planetId, meData]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  // Animation loop for real-time resource regeneration.
  useEffect(() => {
    const animate = () => {
      const now = Date.now();
      const deltaSeconds = (now - lastUpdateRef.current) / 1000;
      lastUpdateRef.current = now;

      setResources((prev) =>
        prev.map((r) => {
          const regenRate = parseFloat(r.regenRate.toString());
          const storageCap = parseFloat(r.storageCap.toString());
          const newAmount = calculateRegen(r.currentAmount, regenRate, deltaSeconds, storageCap);
          return {
            ...r,
            currentAmount: newAmount,
          };
        })
      );

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const data: ResourceChipData[] = resources.slice(0, 5).map((r) => {
    return {
      resourceId: r.resourceId,
      amount: r.currentAmount,
      cap: parseFloat(r.storageCap.toString()),
      rate: Math.round(parseFloat(r.regenRate.toString())),
    };
  });

  // If we have no resources yet, render an empty bar with placeholders so the
  // layout doesn't jump.
  if (data.length === 0) {
    return (
      <CosmicTopBar
        resources={[
          { resourceId: 'water', amount: 0, cap: 1000, rate: 0 },
          { resourceId: 'iron', amount: 0, cap: 1000, rate: 0 },
          { resourceId: 'silicon', amount: 0, cap: 1000, rate: 0 },
          { resourceId: 'methane', amount: 0, cap: 1000, rate: 0 },
          { resourceId: 'tritium', amount: 0, cap: 1000, rate: 0 },
        ]}
      />
    );
  }

  return <CosmicTopBar resources={data} />;
}
