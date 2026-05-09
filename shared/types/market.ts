export type MarketSide = 'buy' | 'sell';

export interface MarketOffer {
  resourceId: string;
  tier: number;
  side: MarketSide;
  pricePerUnit: number;
  availableQty: number;
  modelVersion: string;
}

export interface MarketOffersResponse {
  offers: MarketOffer[];
}

export interface CreateMarketOrderRequest {
  planetId: string;
  side: MarketSide;
  resourceId: string;
  quantity: number;
  expectedUnitPrice: number;
}

export interface CreatedMarketOrder {
  id: string;
  status: string;
  resourceId: string;
  side: MarketSide;
  requestedQty: string;
  totalValue: string;
  avgExecutedPrice: string;
}

export interface CreateMarketOrderResponse {
  order: CreatedMarketOrder;
}
