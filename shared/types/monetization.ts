import type { StarsDiamondPack } from '../config/monetization.js';

export interface StarsDiamondPacksResponse {
  packs: StarsDiamondPack[];
}

export interface CreateStarsInvoiceRequest {
  packId: string;
}

export interface CreateStarsInvoiceResponse {
  invoiceUrl: string;
  pack: StarsDiamondPack;
  checkoutId: string;
}

export interface ConfirmStarsCheckoutRequest {
  packId: string;
  checkoutId: string;
}

export type StarsCheckoutConfirmationStatus = 'delivered' | 'pending' | 'failed';

export interface ConfirmStarsCheckoutResponse {
  status: StarsCheckoutConfirmationStatus;
  pack: StarsDiamondPack;
  credited: boolean;
  paymentId?: number;
  diamondsRemaining?: number;
}
