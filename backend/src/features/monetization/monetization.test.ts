import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { TELEGRAM_STARS_CURRENCY } from '@shared/config/monetization.js';
import { db } from '../../db/index.js';
import { starPayments, users } from '../../db/schema.js';
import {
  answerPreCheckoutQuery,
  createTelegramInvoiceLink,
  getStarTransactions,
  refundStarPayment,
  sendTelegramMessage,
} from '../../lib/telegram.js';
import {
  answerStarsPreCheckout,
  buildStarsInvoicePayload,
  createPaymentSupportRequest,
  createStarsInvoiceLinkForUser,
  listStarsDiamondPacks,
  recordSuccessfulStarsPayment,
  reconcileMissingStarPaymentsForUser,
  refundPaymentSupportRequest,
} from './service.js';

vi.mock('../../lib/telegram.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/telegram.js')>();
  return {
    ...actual,
    answerPreCheckoutQuery: vi.fn(async () => true),
    createTelegramInvoiceLink: vi.fn(async () => 'https://t.me/$test-invoice'),
    getStarTransactions: vi.fn(async () => ({ transactions: [] })),
    refundStarPayment: vi.fn(async () => true),
    sendTelegramMessage: vi.fn(async () => ({ ok: true })),
  };
});

describe('Telegram Stars monetization', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.execute(sql`
      TRUNCATE TABLE
        star_payment_support_requests,
        star_payments,
        users
      RESTART IDENTITY
      CASCADE
    `);
  });

  async function createBuyer(seed = 1, diamonds = 10) {
    const [user] = await db
      .insert(users)
      .values({
        tgId: BigInt(900_000 + seed),
        tgFirstName: 'Stars Buyer',
        tgUsername: `stars_buyer_${seed}`,
        diamonds,
        preferredLocale: seed % 2 === 0 ? 'ru' : 'en',
      })
      .returning();

    return user;
  }

  it('uses the approved Stars diamond pack ladder', () => {
    const packs = listStarsDiamondPacks();
    expect(packs.map((pack) => [pack.diamonds, pack.priceStars])).toEqual([
      [100, 20],
      [500, 85],
      [2500, 350],
      [5000, 600],
      [10000, 1000],
    ]);

    const ratios = packs.map((pack) => pack.diamonds / pack.priceStars);
    for (let i = 1; i < ratios.length; i += 1) {
      const improvement = (ratios[i]! - ratios[i - 1]!) / ratios[i - 1]!;
      expect(improvement).toBeGreaterThanOrEqual(0.10);
      expect(improvement).toBeLessThanOrEqual(0.25);
    }
  });

  it('creates a Telegram Stars invoice link for a pack', async () => {
    const user = await createBuyer(1);

    const result = await createStarsInvoiceLinkForUser({
      userId: user.id,
      packId: 'diamonds_500',
      locale: 'en',
    });

    expect(result.invoiceUrl).toBe('https://t.me/$test-invoice');
    expect(createTelegramInvoiceLink).toHaveBeenCalledWith({
      title: '500 Diamonds',
      description: 'New Universe balance top-up: 500 diamonds.',
      payload: buildStarsInvoicePayload(user.id, 'diamonds_500'),
      currency: TELEGRAM_STARS_CURRENCY,
      prices: [{ label: '500 Diamonds', amount: 85 }],
    });
  });

  it('validates pre-checkout payload, user, currency and amount', async () => {
    const user = await createBuyer(2);
    const payload = buildStarsInvoicePayload(user.id, 'diamonds_100');

    const accepted = await answerStarsPreCheckout({
      id: 'pre-checkout-1',
      from: { id: Number(user.tgId), first_name: 'Buyer' },
      currency: TELEGRAM_STARS_CURRENCY,
      total_amount: 20,
      invoice_payload: payload,
    });

    expect(accepted).toBe(true);
    expect(answerPreCheckoutQuery).toHaveBeenCalledWith('pre-checkout-1', true, undefined);

    const rejected = await answerStarsPreCheckout({
      id: 'pre-checkout-2',
      from: { id: Number(user.tgId), first_name: 'Buyer' },
      currency: TELEGRAM_STARS_CURRENCY,
      total_amount: 21,
      invoice_payload: payload,
    });

    expect(rejected).toBe(false);
    expect(answerPreCheckoutQuery).toHaveBeenLastCalledWith(
      'pre-checkout-2',
      false,
      'This Stars purchase is no longer available.',
    );
  });

  it('credits diamonds once per successful Telegram charge id', async () => {
    const user = await createBuyer(3, 10);
    const payload = buildStarsInvoicePayload(user.id, 'diamonds_500');

    const first = await recordSuccessfulStarsPayment({
      actor: { id: Number(user.tgId), first_name: 'Buyer' },
      payment: {
        currency: TELEGRAM_STARS_CURRENCY,
        total_amount: 85,
        invoice_payload: payload,
        telegram_payment_charge_id: 'charge-500',
        provider_payment_charge_id: 'provider-500',
      },
    });

    expect(first.success).toBe(true);
    expect(first.duplicate).toBe(false);
    expect(first.diamondsRemaining).toBe(510);

    const duplicate = await recordSuccessfulStarsPayment({
      actor: { id: Number(user.tgId), first_name: 'Buyer' },
      payment: {
        currency: TELEGRAM_STARS_CURRENCY,
        total_amount: 85,
        invoice_payload: payload,
        telegram_payment_charge_id: 'charge-500',
        provider_payment_charge_id: 'provider-500',
      },
    });

    const fetched = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { diamonds: true },
    });
    const paymentRows = await db.select().from(starPayments);

    expect(duplicate.success).toBe(true);
    expect(duplicate.duplicate).toBe(true);
    expect(fetched?.diamonds).toBe(510);
    expect(paymentRows).toHaveLength(1);
  });

  it('refunds through support request and reverses delivered diamonds', async () => {
    const user = await createBuyer(4, 30);
    const payload = buildStarsInvoicePayload(user.id, 'diamonds_100');
    const recorded = await recordSuccessfulStarsPayment({
      actor: { id: Number(user.tgId), first_name: 'Buyer' },
      payment: {
        currency: TELEGRAM_STARS_CURRENCY,
        total_amount: 20,
        invoice_payload: payload,
        telegram_payment_charge_id: 'charge-100',
      },
    });

    expect(recorded.success).toBe(true);

    const support = await createPaymentSupportRequest({
      userId: user.id,
      paymentId: recorded.paymentId!,
      reason: 'accidental purchase',
    });
    expect(support.ok).toBe(true);

    const refund = await refundPaymentSupportRequest({
      requestId: support.ok ? support.requestId : 0,
    });

    const fetched = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { diamonds: true },
    });
    const payment = await db.query.starPayments.findFirst({
      where: eq(starPayments.id, recorded.paymentId!),
    });

    expect(refund.ok).toBe(true);
    expect(refundStarPayment).toHaveBeenCalledWith({
      userId: Number(user.tgId),
      telegramPaymentChargeId: 'charge-100',
    });
    expect(fetched?.diamonds).toBe(30);
    expect(payment?.refunded).toBe(true);
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it('reconciles missing Stars payments from Telegram transaction history', async () => {
    const user = await createBuyer(5, 25);
    const payload = buildStarsInvoicePayload(user.id, 'diamonds_100');

    vi.mocked(getStarTransactions).mockResolvedValueOnce({
      transactions: [
        {
          id: 'lost-charge-100',
          amount: 20,
          date: Math.floor(Date.now() / 1000),
          source: {
            type: 'user',
            transaction_type: 'invoice_payment',
            user: { id: Number(user.tgId), first_name: 'Buyer' },
            invoice_payload: payload,
          },
        },
      ],
    });

    const result = await reconcileMissingStarPaymentsForUser({
      userId: user.id,
      telegramUserId: user.tgId,
    });

    const fetched = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { diamonds: true },
    });
    const payment = await db.query.starPayments.findFirst({
      where: eq(starPayments.telegramPaymentChargeId, 'lost-charge-100'),
    });

    expect(result).toEqual({ scanned: 1, recorded: 1 });
    expect(fetched?.diamonds).toBe(125);
    expect(payment?.priceStars).toBe(20);
  });
});
