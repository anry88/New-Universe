import { describe, expect, it } from 'vitest';
import {
  ACTIVE_STARS_CHECKOUT_MAX_AGE_MS,
  CHECKOUT_AUTO_CONFIRM_MAX_ATTEMPTS,
  checkoutStatusFromInvoiceCallback,
  checkoutStatusKey,
  checkoutStatusTone,
  encodeStoredStarsCheckout,
  parseStoredStarsCheckout,
  shouldAutoClearCheckoutStatus,
  shouldAutoConfirmCheckout,
  shouldConfirmInvoiceStatus,
} from './stars-checkout';

describe('stars checkout helpers', () => {
  it('maps known and unknown checkout statuses to localization keys', () => {
    expect(checkoutStatusKey('delivered')).toBe('shop.checkout.delivered');
    expect(checkoutStatusKey('pendingDelivery')).toBe('shop.checkout.pendingDelivery');
    expect(checkoutStatusKey('processing')).toBe('shop.checkout.processing');
    expect(checkoutStatusKey('unexpected-status')).toBe('shop.checkout.unknown');
  });

  it('uses prominent tones for pending, delivered and failed states', () => {
    expect(checkoutStatusTone('pendingDelivery')).toBe('warning');
    expect(checkoutStatusTone('processing')).toBe('warning');
    expect(checkoutStatusTone('confirming')).toBe('warning');
    expect(checkoutStatusTone('delivered')).toBe('success');
    expect(checkoutStatusTone('failedDelivery')).toBe('danger');
    expect(checkoutStatusTone('unknown')).toBe('info');
  });

  it('confirms only invoice statuses that prove a paid checkout', () => {
    expect(shouldConfirmInvoiceStatus('paid')).toBe(true);
    expect(shouldConfirmInvoiceStatus('pending')).toBe(false);
    expect(shouldConfirmInvoiceStatus('cancelled')).toBe(false);
    expect(shouldConfirmInvoiceStatus('failed')).toBe(false);
    expect(shouldConfirmInvoiceStatus('unknown')).toBe(false);
  });

  it('normalizes Telegram pending callback into a non-persistent processing state', () => {
    expect(checkoutStatusFromInvoiceCallback('pending')).toBe('processing');
    expect(checkoutStatusFromInvoiceCallback('paid')).toBe('paid');
    expect(checkoutStatusFromInvoiceCallback('cancelled')).toBe('cancelled');
  });

  it('auto-clears only transient non-paid checkout notices', () => {
    expect(shouldAutoClearCheckoutStatus('processing')).toBe(true);
    expect(shouldAutoClearCheckoutStatus('pending')).toBe(false);
    expect(shouldAutoClearCheckoutStatus('pendingDelivery')).toBe(false);
    expect(shouldAutoClearCheckoutStatus(null)).toBe(false);
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

  it('encodes and restores active paid checkout references while they are fresh', () => {
    const stored = encodeStoredStarsCheckout({
      packId: 'diamonds_100',
      checkoutId: 'checkout-1',
    }, 10_000);

    expect(parseStoredStarsCheckout(stored, 11_000)).toEqual({
      packId: 'diamonds_100',
      checkoutId: 'checkout-1',
    });
  });

  it('encodes and restores active fallback checkout references while they are fresh', () => {
    const stored = encodeStoredStarsCheckout({
      packId: 'diamonds_100',
      checkoutId: 'checkout-1',
    }, 'fallback', 10_000);

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
    expect(parseStoredStarsCheckout('{"packId":"diamonds_100","checkoutId":"legacy","createdAtMs":10000}', 11_000)).toBeNull();
    expect(parseStoredStarsCheckout(fresh, 10_000 + ACTIVE_STARS_CHECKOUT_MAX_AGE_MS + 1)).toBeNull();
  });
});
