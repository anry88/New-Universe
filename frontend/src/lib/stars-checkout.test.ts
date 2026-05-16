import { describe, expect, it } from 'vitest';
import {
  CHECKOUT_AUTO_CONFIRM_MAX_ATTEMPTS,
  checkoutStatusKey,
  checkoutStatusTone,
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

  it('keeps auto-confirm polling active only for pending delivery checkouts', () => {
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
});
