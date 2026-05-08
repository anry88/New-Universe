export interface Expedition {
  id: string;
  shipId: string;
  type: string;
  originPlanetId: string;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetPlanetId: string | null;
  status: string;
  eta: string;
  returnedAt: string | null;
  result: Record<string, unknown>;
}
