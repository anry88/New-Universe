import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handleTelegramUpdate } from './webhook.js';
import { TelegramUpdate } from '../../lib/telegram.js';
import { db } from '../../db/index.js';
import {
  starPaymentSupportRequests,
  starPayments,
  telegramRegistrationReferrals,
  users,
} from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { buildStarsInvoicePayload } from '../monetization/service.js';

const fetchMock = vi.fn();
global.fetch = fetchMock;

vi.mock('../../lib/env.js', () => ({
  env: {
    ADMIN_TELEGRAM_IDS: [12345n],
    ADMIN_TELEGRAM_CHAT_IDS: [12345n],
    PUBLIC_FRONTEND_URL: 'https://test-app.nu',
  },
}));

describe('Bot Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: {} }),
    });
  });

  it('should handle /start command', async () => {
    const update: TelegramUpdate = {
      update_id: 1,
      message: {
        message_id: 100,
        chat: { id: 12345, type: 'private' },
        text: '/start',
        from: { id: 12345, first_name: 'Test User' },
      },
    };

    await handleTelegramUpdate(update);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/sendMessage');
    
    const body = JSON.parse(options.body);
    expect(body.chat_id).toBe(12345);
    expect(body.text).toContain('Добро пожаловать');
    expect(body.reply_markup.inline_keyboard[0][0].text).toBe('Открыть New Universe');
    expect(body.reply_markup.inline_keyboard[0][0].web_app.url).toBeDefined();
  });

  it('clears blocked Telegram notification state on /start', async () => {
    const now = Date.now();
    const tgId = 730000 + now;
    const [user] = await db
      .insert(users)
      .values({
        tgId: BigInt(tgId),
        tgUsername: `start_reset_${now}`,
        tgFirstName: 'StartReset',
        telegramNotificationsBlockedAt: new Date(),
      })
      .returning({ id: users.id });

    const update: TelegramUpdate = {
      update_id: 9,
      message: {
        message_id: 109,
        chat: { id: tgId, type: 'private' },
        text: '/start',
        from: { id: tgId, first_name: 'Start Reset' },
      },
    };

    await handleTelegramUpdate(update);

    const fetched = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { telegramNotificationsBlockedAt: true },
    });
    expect(fetched?.telegramNotificationsBlockedAt).toBeNull();

    await db.delete(users).where(eq(users.id, user.id));
  });

  it('captures a Telegram /start referral code before account registration', async () => {
    const now = Date.now();
    const tgId = 735000 + now;
    const update: TelegramUpdate = {
      update_id: 12,
      message: {
        message_id: 112,
        chat: { id: tgId, type: 'private' },
        text: '/start _tgr_TDf151JhYjYy',
        from: { id: tgId, first_name: 'Referral' },
      },
    };

    await handleTelegramUpdate(update);

    const pendingReferral = await db.query.telegramRegistrationReferrals.findFirst({
      where: eq(telegramRegistrationReferrals.tgId, BigInt(tgId)),
    });
    expect(pendingReferral).toMatchObject({
      referralCode: '_tgr_TDf151JhYjYy',
    });

    await db
      .delete(telegramRegistrationReferrals)
      .where(eq(telegramRegistrationReferrals.tgId, BigInt(tgId)));
  });

  it('does not capture a Telegram /start referral code for an existing account', async () => {
    const now = Date.now();
    const tgId = 736000 + now;
    const [user] = await db
      .insert(users)
      .values({
        tgId: BigInt(tgId),
        tgUsername: `existing_referral_${now}`,
        tgFirstName: 'ExistingReferral',
      })
      .returning({ id: users.id });
    const update: TelegramUpdate = {
      update_id: 13,
      message: {
        message_id: 113,
        chat: { id: tgId, type: 'private' },
        text: '/start _tgr_existing_user',
        from: { id: tgId, first_name: 'ExistingReferral' },
      },
    };

    await handleTelegramUpdate(update);

    const pendingReferral = await db.query.telegramRegistrationReferrals.findFirst({
      where: eq(telegramRegistrationReferrals.tgId, BigInt(tgId)),
    });
    expect(pendingReferral).toBeUndefined();

    await db.delete(users).where(eq(users.id, user.id));
  });

  it('should ignore other messages', async () => {
    const update: TelegramUpdate = {
      update_id: 2,
      message: {
        message_id: 101,
        chat: { id: 12345, type: 'private' },
        text: 'Hello',
        from: { id: 12345, first_name: 'Test User' },
      },
    };

    await handleTelegramUpdate(update);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should ignore unsupported slash commands', async () => {
    const update: TelegramUpdate = {
      update_id: 6,
      message: {
        message_id: 106,
        chat: { id: 12345, type: 'private' },
        text: '/unknown_command',
        from: { id: 12345, first_name: 'Test User' },
      },
    };

    await handleTelegramUpdate(update);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should ignore empty text messages safely', async () => {
    const update: TelegramUpdate = {
      update_id: 7,
      message: {
        message_id: 107,
        chat: { id: 12345, type: 'private' },
        text: '   ',
        from: { id: 12345, first_name: 'Test User' },
      },
    };

    await handleTelegramUpdate(update);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should add diamonds via add_diamond command for admin', async () => {
    const now = Date.now();
    const targetUsername = `cmd_admin_target_${now}`;
    const targetTgId = 700000 + now;

    const [target] = await db
      .insert(users)
      .values({
        tgId: BigInt(targetTgId),
        tgUsername: targetUsername,
        tgFirstName: 'Target',
        diamonds: 100,
      })
      .returning({ id: users.id, diamonds: users.diamonds });

    expect(target).toBeDefined();

    const update: TelegramUpdate = {
      update_id: 3,
      message: {
        message_id: 102,
        chat: { id: 12345, type: 'private' },
        text: `/add_diamond @${targetUsername} 50`,
        from: { id: 12345, first_name: 'Admin', language_code: 'ru' },
      },
    };

    await handleTelegramUpdate(update);

    const fetched = await db.query.users.findFirst({
      where: eq(users.id, target.id),
      columns: { diamonds: true },
    });

    expect(fetched?.diamonds).toBe(150);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/sendMessage');
    const body = JSON.parse(options.body);
    expect(body.chat_id).toBe(12345);
    expect(body.text).toContain('Админ-операция');

    await db.delete(users).where(eq(users.id, target.id));
  });

  it('should add diamonds via addressed add_diamond command for admin', async () => {
    const now = Date.now();
    const targetUsername = `cmd_admin_target_mention_${now}`;
    const targetTgId = 710000 + now;

    const [target] = await db
      .insert(users)
      .values({
        tgId: BigInt(targetTgId),
        tgUsername: targetUsername,
        tgFirstName: 'Target',
        diamonds: 100,
      })
      .returning({ id: users.id, diamonds: users.diamonds });

    expect(target).toBeDefined();

    const update: TelegramUpdate = {
      update_id: 8,
      message: {
        message_id: 108,
        chat: { id: 12345, type: 'private' },
        text: `/add_diamond@TestBot @${targetUsername} 25`,
        from: { id: 12345, first_name: 'Admin', language_code: 'en' },
      },
    };

    await handleTelegramUpdate(update);

    const fetched = await db.query.users.findFirst({
      where: eq(users.id, target.id),
      columns: { diamonds: true },
    });

    expect(fetched?.diamonds).toBe(125);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/sendMessage');
    const body = JSON.parse(options.body);
    expect(body.chat_id).toBe(12345);
    expect(body.text).toContain('Admin action');

    await db.delete(users).where(eq(users.id, target.id));
  });

  it('should return user-not-found for unknown username in add_diamond', async () => {
    const update: TelegramUpdate = {
      update_id: 5,
      message: {
        message_id: 104,
        chat: { id: 12345, type: 'private' },
        text: '/add_diamond @unknown_player_404 50',
        from: { id: 12345, first_name: 'Admin', language_code: 'ru' },
      },
    };

    await handleTelegramUpdate(update);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/sendMessage');
    const body = JSON.parse(options.body);
    expect(body.chat_id).toBe(12345);
    expect(body.text).toContain('не найден');
  });

  it('should reject add_diamond command from non-admin', async () => {
    const now = Date.now();
    const targetUsername = `cmd_admin_blocked_${now}`;
    const targetTgId = 800000 + now;

    const [target] = await db
      .insert(users)
      .values({
        tgId: BigInt(targetTgId),
        tgUsername: targetUsername,
        tgFirstName: 'Target',
        diamonds: 100,
      })
      .returning({ id: users.id, diamonds: users.diamonds });

    expect(target).toBeDefined();

    const update: TelegramUpdate = {
      update_id: 4,
      message: {
        message_id: 103,
        chat: { id: 55555, type: 'private' },
        text: `/add_diamond @${targetUsername} 50`,
        from: { id: 55555, first_name: 'Player', language_code: 'en' },
      },
    };

    await handleTelegramUpdate(update);

    const fetched = await db.query.users.findFirst({
      where: eq(users.id, target.id),
      columns: { diamonds: true },
    });
    expect(fetched?.diamonds).toBe(100);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/sendMessage');
    const body = JSON.parse(options.body);
    expect(body.chat_id).toBe(55555);
    expect(body.text).toContain('Access denied');

    await db.delete(users).where(eq(users.id, target.id));
  });

  it('should create refund support request via paysupport command', async () => {
    const now = Date.now();
    const buyerTgId = 900000 + now;

    const [buyer] = await db
      .insert(users)
      .values({
        tgId: BigInt(buyerTgId),
        tgUsername: `support_buyer_${now}`,
        tgFirstName: 'Buyer',
        diamonds: 500,
      })
      .returning({ id: users.id });

    const [payment] = await db
      .insert(starPayments)
      .values({
        userId: buyer.id,
        packId: 'diamonds_500',
        diamonds: 500,
        priceStars: 85,
        currency: 'XTR',
        invoicePayload: `pack=diamonds_500;user=${buyer.id}`,
        telegramPaymentChargeId: `charge-support-${now}`,
      })
      .returning({ id: starPayments.id });

    const update: TelegramUpdate = {
      update_id: 9,
      message: {
        message_id: 109,
        chat: { id: buyerTgId, type: 'private' },
        text: `/paysupport ${payment.id} accidental purchase`,
        from: { id: buyerTgId, first_name: 'Buyer', language_code: 'en' },
      },
    };

    await handleTelegramUpdate(update);

    const supportRequest = await db.query.starPaymentSupportRequests.findFirst({
      where: eq(starPaymentSupportRequests.paymentId, payment.id),
    });

    expect(supportRequest?.status).toBe('pending');
    expect(supportRequest?.reason).toBe('accidental purchase');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, userReplyOptions] = fetchMock.mock.calls[0];
    expect(JSON.parse(userReplyOptions.body).text).toContain('Refund request');

    const [, adminOptions] = fetchMock.mock.calls[1];
    const adminBody = JSON.parse(adminOptions.body);
    expect(adminBody.chat_id).toBe(12345);
    expect(adminBody.text).toContain('/refund');

    await db.delete(starPaymentSupportRequests).where(eq(starPaymentSupportRequests.id, supportRequest!.id));
    await db.delete(starPayments).where(eq(starPayments.id, payment.id));
    await db.delete(users).where(eq(users.id, buyer.id));
  });

  it('should list refundable payments with Telegram HTML-safe command hints', async () => {
    const now = Date.now();
    const buyerTgId = 910000 + now;

    const [buyer] = await db
      .insert(users)
      .values({
        tgId: BigInt(buyerTgId),
        tgUsername: `support_list_buyer_${now}`,
        tgFirstName: 'Buyer',
        diamonds: 100,
      })
      .returning({ id: users.id });

    const [payment] = await db
      .insert(starPayments)
      .values({
        userId: buyer.id,
        packId: 'diamonds_100',
        diamonds: 100,
        priceStars: 20,
        currency: 'XTR',
        invoicePayload: `pack=diamonds_100;user=${buyer.id}`,
        telegramPaymentChargeId: `charge-support-list-${now}`,
      })
      .returning({ id: starPayments.id });

    const update: TelegramUpdate = {
      update_id: 10,
      message: {
        message_id: 110,
        chat: { id: buyerTgId, type: 'private' },
        text: '/paysupport',
        from: { id: buyerTgId, first_name: 'Buyer', language_code: 'en' },
      },
    };

    await handleTelegramUpdate(update);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.chat_id).toBe(buyerTgId);
    expect(body.text).toContain('/paysupport &lt;ID&gt; &lt;reason&gt;');
    expect(body.text).not.toContain('/paysupport <ID> <reason>');
    expect(body.text).toContain(`<code>${payment.id}</code>`);

    await db.delete(starPayments).where(eq(starPayments.id, payment.id));
    await db.delete(users).where(eq(users.id, buyer.id));
  });

  it('should report recovered Stars delivery without creating a refund request in the same paysupport command', async () => {
    const now = Date.now();
    const buyerTgId = 920000 + now;

    const [buyer] = await db
      .insert(users)
      .values({
        tgId: BigInt(buyerTgId),
        tgUsername: `support_recovery_buyer_${now}`,
        tgFirstName: 'Buyer',
        diamonds: 0,
      })
      .returning({ id: users.id, diamonds: users.diamonds });

    const payload = buildStarsInvoicePayload(buyer.id, 'diamonds_100');

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            transactions: [
              {
                id: `charge-support-recovery-${now}`,
                amount: 20,
                date: Math.floor(now / 1000),
                source: {
                  type: 'user',
                  transaction_type: 'invoice_payment',
                  user: { id: buyerTgId, first_name: 'Buyer' },
                  invoice_payload: payload,
                },
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: {} }),
      });

    const update: TelegramUpdate = {
      update_id: 11,
      message: {
        message_id: 111,
        chat: { id: buyerTgId, type: 'private' },
        text: '/paysupport 1 accidental purchase',
        from: { id: buyerTgId, first_name: 'Buyer', language_code: 'en' },
      },
    };

    await handleTelegramUpdate(update);

    const fetched = await db.query.users.findFirst({
      where: eq(users.id, buyer.id),
      columns: { diamonds: true },
    });
    const recoveredPayment = await db.query.starPayments.findFirst({
      where: eq(starPayments.userId, buyer.id),
    });
    const supportRequest = await db.query.starPaymentSupportRequests.findFirst({
      where: eq(starPaymentSupportRequests.userId, buyer.id),
    });

    expect(fetched?.diamonds).toBe(100);
    expect(recoveredPayment?.telegramPaymentChargeId).toBe(`charge-support-recovery-${now}`);
    expect(supportRequest).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [historyUrl] = fetchMock.mock.calls[0];
    expect(historyUrl).toContain('/getStarTransactions');
    const [, userReplyOptions] = fetchMock.mock.calls[1];
    const body = JSON.parse(userReplyOptions.body);
    expect(body.text).toContain('found and delivered');
    expect(body.text).toContain('/paysupport &lt;ID&gt; &lt;reason&gt;');

    await db.delete(starPayments).where(eq(starPayments.id, recoveredPayment!.id));
    await db.delete(users).where(eq(users.id, buyer.id));
  });
});
