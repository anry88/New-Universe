import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ConfirmStarsCheckoutRequest,
  ConfirmStarsCheckoutResponse,
  CreateStarsInvoiceRequest,
  CreateStarsInvoiceResponse,
  StarsDiamondPacksResponse,
} from '@shared/types/monetization';
import type { User } from '@shared/types/user';
import { apiFetch } from '../lib/api';

export function useStarsDiamondPacks() {
  return useQuery({
    queryKey: ['stars-diamond-packs'],
    queryFn: () => apiFetch<StarsDiamondPacksResponse>('/monetization/stars/packs'),
  });
}

export function useCreateStarsInvoice() {
  return useMutation({
    mutationFn: (packId: string) =>
      apiFetch<CreateStarsInvoiceResponse>('/monetization/stars/invoice', {
        method: 'POST',
        body: JSON.stringify({ packId } satisfies CreateStarsInvoiceRequest),
      }),
  });
}

export function useConfirmStarsCheckout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: ConfirmStarsCheckoutRequest) =>
      apiFetch<ConfirmStarsCheckoutResponse>('/monetization/stars/checkout-result', {
        method: 'POST',
        body: JSON.stringify(request),
      }),
    onSuccess: (result) => {
      if (typeof result.diamondsRemaining === 'number') {
        queryClient.setQueryData<User>(['me'], (current) => current
          ? { ...current, diamonds: result.diamondsRemaining! }
          : current);
      }

      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}
