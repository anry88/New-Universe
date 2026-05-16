import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateStarsInvoiceRequest,
  CreateStarsInvoiceResponse,
  StarsDiamondPacksResponse,
} from '@shared/types/monetization';
import { apiFetch } from '../lib/api';

export function useStarsDiamondPacks() {
  return useQuery({
    queryKey: ['stars-diamond-packs'],
    queryFn: () => apiFetch<StarsDiamondPacksResponse>('/monetization/stars/packs'),
  });
}

export function useCreateStarsInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (packId: string) =>
      apiFetch<CreateStarsInvoiceResponse>('/monetization/stars/invoice', {
        method: 'POST',
        body: JSON.stringify({ packId } satisfies CreateStarsInvoiceRequest),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}
