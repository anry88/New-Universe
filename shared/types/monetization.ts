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
}
