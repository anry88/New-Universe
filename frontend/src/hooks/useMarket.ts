import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import type {
  CreateMarketOrderRequest,
  CreateMarketOrderResponse,
  CreatedMarketOrder,
  MarketOffersResponse,
} from '@shared/types/market';

export interface PendingMarketOrder extends CreatedMarketOrder {
  submittedAt: string;
  etaSec: number;
}

const LOCAL_PENDING_ETA_SEC = 120;

export function normalizeMarketError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Failed to submit market order';
  const normalized = message.toLowerCase();

  if (normalized.includes('storage')) {
    return 'Not enough storage capacity for this buy order.';
  }
  if (normalized.includes('not enough')) {
    return 'Insufficient resources for this order.';
  }
  if (normalized.includes('price moved')) {
    return 'Market price changed. Refresh offers and try again.';
  }

  return message;
}

export function useMarketOffers() {
  return useQuery({
    queryKey: ['market-offers'],
    queryFn: () => apiFetch<MarketOffersResponse>('/market/offers'),
    refetchInterval: 30_000,
  });
}

export function usePendingMarketOrders() {
  return useQuery({
    queryKey: ['market-pending-orders'],
    queryFn: async () => [] as PendingMarketOrder[],
    initialData: [] as PendingMarketOrder[],
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useCreateMarketOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateMarketOrderRequest) =>
      apiFetch<CreateMarketOrderResponse>('/market/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      const previous = queryClient.getQueryData<PendingMarketOrder[]>(['market-pending-orders']) ?? [];
      const pending: PendingMarketOrder = {
        ...data.order,
        submittedAt: new Date().toISOString(),
        etaSec: LOCAL_PENDING_ETA_SEC,
      };
      queryClient.setQueryData(['market-pending-orders'], [pending, ...previous]);
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

