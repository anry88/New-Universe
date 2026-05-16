import { describe, expect, it } from 'vitest';
import {
  ACTIVE_STARS_CHECKOUT_MAX_AGE_MS,
  CHECKOUT_AUTO_CONFIRM_MAX_ATTEMPTS,
  checkoutStatusKey,
  checkoutStatusTone,
  encodeStoredStarsCheckout,
  parseStoredStarsCheckout,
  shouldConfirmInvoiceStatus,
  shouldAutoConfirmCheckout,
} from './stars-checkout';

describe('stars checkout helpers', () => {
  it('maps known and unknown checkout statuses to localization keys', () => {
    expect(checkoutStatusKey('delivered')).toBe('shop.checkout.delivered');
    expect(checkoutStatusKey('pendingDelivery')).toBe('shop.checkout.pendingDelivery');
    expect(checkoutStatusKey('unexpected-status')).toBe('shop.checkout.unknown');
  });

  it('uses prominent tones for pending, delivered and failed states', () => {
    expect(checkoutStatusTone('pendingDelivery')).toBe('warning');
    expect(checkoutStatusTone('confirming')).toBe('warning');
    expect(checkoutStatusTone('delivered')).toBe('success');
    expect(checkoutStatusTone('failedDelivery')).toBe('danger');
    expect(checkoutStatusTone('unknown')).toBe('info');
  });

  it('confirms invoice statuses that can represent an in-flight paid checkout', () => {
    expect(shouldConfirmInvoiceStatus('paid')).toBe(true);
    expect(shouldConfirmInvoiceStatus('pending')).toBe(true);
    expect(shouldConfirmInvoiceStatus('cancelled')).toBe(false);
    expect(shouldConfirmInvoiceStatus('failed')).toBe(false);
    expect(shouldConfirmInvoiceStatus('unknown')).toBe(false);
  });

  it('keeps auto-confirm polling active for pending checkout states', () => {
    expect(shouldAutoConfirmCheckout({
      status: 'pending',
      hasCheckout: true,
      checkoutBusy: false,
      attempts: 0,
    })).toBe(true);

    expect(shouldAutoConfirmCheckout({
      status: 'pendingDelivery',
      hasCheckout: true,
      checkoutBusy: false,
      attempts: 0,
    })).toBe(true);

    expect(shouldAutoConfirmCheckout({
      status: 'pendingDelivery',
      hasCheckout: true,
      checkoutBusy: false,
      attempts: CHECKOUT_AUTO_CONFIRM_MAX_ATTEMPTS,
    })).toBe(false);

    expect(shouldAutoConfirmCheckout({
      status: 'delivered',
      hasCheckout: true,
      checkoutBusy: false,
      attempts: 0,
    })).toBe(false);

    expect(shouldAutoConfirmCheckout({
      status: 'pendingDelivery',
      hasCheckout: false,
      checkoutBusy: false,
      attempts: 0,
    })).toBe(false);

    expect(shouldAutoConfirmCheckout({
      status: 'pendingDelivery',
      hasCheckout: true,
      checkoutBusy: true,
      attempts: 0,
    })).toBe(false);
  });

  it('encodes and restores active checkout references while they are fresh', () => {
    const stored = encodeStoredStarsCheckout({
      packId: 'diamonds_100',
      checkoutId: 'checkout-1',
    }, 10_000);

    expect(parseStoredStarsCheckout(stored, 11_000)).toEqual({
      packId: 'diamonds_100',
      checkoutId: 'checkout-1',
    });
  });

  it('drops invalid or stale active checkout references', () => {
    const fresh = encodeStoredStarsCheckout({
      packId: 'diamonds_100',
      checkoutId: 'checkout-1',
    }, 10_000);

    expect(parseStoredStarsCheckout(null, 11_000)).toBeNull();
    expect(parseStoredStarsCheckout('{bad-json', 11_000)).toBeNull();
    expect(parseStoredStarsCheckout('{"packId":"","checkoutId":"checkout-1","createdAtMs":10000}', 11_000)).toBeNull();
    expect(parseStoredStarsCheckout(fresh, 10_000 + ACTIVE_STARS_CHECKOUT_MAX_AGE_MS + 1)).toBeNull();
  });
});
