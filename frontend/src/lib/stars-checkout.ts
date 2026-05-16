export const CHECKOUT_CONFIRM_ATTEMPTS = 5;
export const CHECKOUT_CONFIRM_DELAY_MS = 1_000;
export const CHECKOUT_AUTO_CONFIRM_DELAY_MS = 2_000;
export const CHECKOUT_AUTO_CONFIRM_MAX_ATTEMPTS = 60;

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

export function shouldAutoConfirmCheckout(input: {
  status: string | null;
  hasCheckout: boolean;
  checkoutBusy: boolean;
  attempts: number;
}): boolean {
  return (
    input.status === 'pendingDelivery' &&
    input.hasCheckout &&
    !input.checkoutBusy &&
    input.attempts < CHECKOUT_AUTO_CONFIRM_MAX_ATTEMPTS
  );
}
