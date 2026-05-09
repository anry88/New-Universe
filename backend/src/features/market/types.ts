import type {
  marketOrderStatusEnum,
  marketOrderTypeEnum,
  marketScopeEnum,
  marketSideEnum,
} from '../../db/schema/market.js';

export type MarketScope = (typeof marketScopeEnum.enumValues)[number];
export type MarketSide = (typeof marketSideEnum.enumValues)[number];
export type MarketOrderType = (typeof marketOrderTypeEnum.enumValues)[number];
export type MarketOrderStatus = (typeof marketOrderStatusEnum.enumValues)[number];

export interface MarketOfferDto {
  id: string;
  scope: MarketScope;
  side: MarketSide;
  resourceId: string;
  status: 'active' | 'paused' | 'exhausted' | 'archived';
  pricePerUnit: string;
  availableQty: string;
  minQty: string | null;
  feeBps: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

export interface MarketOrderDto {
  id: string;
  userId: string;
  scope: MarketScope;
  side: MarketSide;
  orderType: MarketOrderType;
  status: MarketOrderStatus;
  resourceId: string;
  requestedQty: string;
  filledQty: string;
  limitPrice: string | null;
  avgExecutedPrice: string | null;
  feeBps: number;
  feeAmount: string;
  totalValue: string;
  sourceOfferId: string | null;
  deliveryExpeditionId: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export const MARKET_ORDER_STATUS_TRANSITIONS: Record<MarketOrderStatus, MarketOrderStatus[]> = {
  open: ['partially_filled', 'filled', 'cancelled', 'expired', 'failed'],
  partially_filled: ['filled', 'cancelled', 'expired', 'failed'],
  filled: ['settled'],
  cancelled: [],
  expired: [],
  failed: [],
  settled: [],
};

export function canTransitionMarketOrderStatus(
  from: MarketOrderStatus,
  to: MarketOrderStatus,
): boolean {
  if (from === to) return true;
  return MARKET_ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
