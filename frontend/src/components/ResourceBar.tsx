import { useState, useEffect, useRef, useCallback } from 'react';
import { useMe } from '../hooks/useMe';
import { apiFetch } from '../lib/api';
import type { PlanetResource } from '@shared/types/world';

interface ResourceBarProps {
  planetId?: string;
}

interface ResourceWithAmount extends PlanetResource {
  currentAmount: number;
  targetAmount: number;
}

export function ResourceBar({ planetId }: ResourceBarProps) {
  const { data: meData } = useMe();
  const [resources, setResources] = useState<ResourceWithAmount[]>([]);
  const animationRef = useRef<number>();
  const lastUpdateRef = useRef<number>(Date.now());

  const fetchResources = useCallback(async () => {
    if (!planetId) return;
    try {
      const data = await apiFetch<{ resources: PlanetResource[] }>(`/planets/${planetId}/resources`);
      setResources(data.resources.map(r => ({
        ...r,
        currentAmount: parseFloat(r.amount),
        targetAmount: parseFloat(r.amount),
      })));
    } catch {
      // For now, use mock data if API not ready
      if (meData?.homeSystem?.planets?.[0]?.resources) {
        const mockResources = meData.homeSystem.planets[0].resources;
        setResources(mockResources.map(r => ({
          ...r,
          currentAmount: parseFloat(r.amount),
          targetAmount: parseFloat(r.amount),
        })));
      }
    }
  }, [planetId, meData]);

  useEffect(() => {

    fetchResources();
  }, [fetchResources]);

  // Animation loop for real-time resource regeneration
  useEffect(() => {
    const animate = () => {
      const now = Date.now();
      const deltaSeconds = (now - lastUpdateRef.current) / 1000;
      lastUpdateRef.current = now;

      setResources(prev => 
        prev.map(r => {
          const regenRate = parseFloat(r.regenRate.toString());
          const newAmount = r.currentAmount + regenRate * deltaSeconds;
          const target = parseFloat(r.targetAmount.toString());
          return {
            ...r,
            currentAmount: Math.min(newAmount, target),
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

  const getResourceIcon = (resourceId: string) => {
    const icons: Record<string, string> = {
      water: '💧',
      iron: '⚙️',
      carbon: '🖤',
      silicon: '💎',
      methane: '🔥',
      copper: '🟫',
      aluminum: '⬜',
      titanium: '🔩',
      ice: '🧊',
      sulfur: '💛',
      tritium: '☢️',
    };
    return icons[resourceId] || '📦';
  };

  return (
    <div className="bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 px-4 py-2">
      <div className="flex items-center justify-around max-w-4xl mx-auto">
        {resources.slice(0, 6).map(resource => (
          <div key={resource.resourceId} className="flex flex-col items-center gap-1">
            <span className="text-xl">{getResourceIcon(resource.resourceId)}</span>
            <span className="text-xs text-slate-400">{resource.resourceId}</span>
            <span className="text-sm font-bold text-white">
              {resource.currentAmount.toFixed(0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
