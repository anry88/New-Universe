export const CHECKOUT_CONFIRM_ATTEMPTS = 5;
export const CHECKOUT_CONFIRM_DELAY_MS = 1_000;
export const CHECKOUT_AUTO_CONFIRM_DELAY_MS = 2_000;
export const CHECKOUT_AUTO_CONFIRM_MAX_ATTEMPTS = 60;
export const ACTIVE_STARS_CHECKOUT_STORAGE_KEY = 'nu_active_stars_checkout';
export const ACTIVE_STARS_CHECKOUT_MAX_AGE_MS = 30 * 60 * 1_000;

export const CHECKOUT_STATUS_KEYS = [
  'paid',
  'cancelled',
  'failed',
  'pending',
  'confirming',
  'delivered',
  'pendingDelivery',
  'failedDelivery',
] as const;

export type CheckoutDisplayTone = 'info' | 'success' | 'warning' | 'danger';

export type StarsCheckoutReference = {
  packId: string;
  checkoutId: string;
};

export type StoredStarsCheckoutReference = StarsCheckoutReference & {
  createdAtMs: number;
};

export function checkoutStatusKey(status: string): string {
  return CHECKOUT_STATUS_KEYS.includes(status as (typeof CHECKOUT_STATUS_KEYS)[number])
    ? `shop.checkout.${status}`
    : 'shop.checkout.unknown';
}

export function checkoutStatusTone(status: string): CheckoutDisplayTone {
  if (status === 'delivered') return 'success';
  if (status === 'pendingDelivery' || status === 'pending' || status === 'confirming' || status === 'paid') {
    return 'warning';
  }
  if (status === 'failedDelivery' || status === 'failed' || status === 'cancelled') return 'danger';
  return 'info';
}

export function shouldConfirmInvoiceStatus(status: string): boolean {
  return status === 'paid' || status === 'pending';
}

export function shouldAutoConfirmCheckout(input: {
  status: string | null;
  hasCheckout: boolean;
  checkoutBusy: boolean;
  attempts: number;
}): boolean {
  return (
    (input.status === 'pendingDelivery' || input.status === 'pending') &&
    input.hasCheckout &&
    !input.checkoutBusy &&
    input.attempts < CHECKOUT_AUTO_CONFIRM_MAX_ATTEMPTS
  );
}

export function encodeStoredStarsCheckout(
  checkout: StarsCheckoutReference,
  nowMs = Date.now(),
): string {
  return JSON.stringify({
    packId: checkout.packId,
    checkoutId: checkout.checkoutId,
    createdAtMs: nowMs,
  } satisfies StoredStarsCheckoutReference);
}

export function parseStoredStarsCheckout(
  value: string | null,
  nowMs = Date.now(),
): StarsCheckoutReference | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<StoredStarsCheckoutReference>;
    if (
      typeof parsed.packId !== 'string' ||
      parsed.packId.length === 0 ||
      typeof parsed.checkoutId !== 'string' ||
      parsed.checkoutId.length === 0 ||
      typeof parsed.createdAtMs !== 'number' ||
      !Number.isFinite(parsed.createdAtMs) ||
      nowMs - parsed.createdAtMs > ACTIVE_STARS_CHECKOUT_MAX_AGE_MS
    ) {
      return null;
    }

    return {
      packId: parsed.packId,
      checkoutId: parsed.checkoutId,
    };
  } catch {
    return null;
  }
}
