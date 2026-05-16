import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  STARS_DIAMOND_PACKS,
  TELEGRAM_STARS_CURRENCY,
  findStarsDiamondPack,
  type StarsDiamondPack,
} from '@shared/config/monetization.js';
import type { Locale } from '@shared/types/locale.js';
import type { ConfirmStarsCheckoutResponse } from '@shared/types/monetization.js';
import { db as defaultDb } from '../../db/index.js';
import { starPayments, starPaymentSupportRequests, users } from '../../db/schema.js';
import {
  answerPreCheckoutQuery,
  createTelegramInvoiceLink,
  getStarTransactions,
  refundStarPayment,
  sendTelegramMessage,
  type TelegramPreCheckoutQuery,
  type TelegramStarTransaction,
  type TelegramSuccessfulPayment,
  type TelegramUser,
} from '../../lib/telegram.js';
import { env } from '../../lib/env.js';
import { logger } from '../../lib/logger.js';
import { trackBackendEvent } from '../../lib/analytics.js';

const OPEN_SUPPORT_STATUSES = ['pending', 'info_requested'] as const;

export type SupportRequestStatus =
  | 'pending'
  | 'info_requested'
  | 'refunded'
  | 'rejected'
  | 'refund_failed';

export interface ParsedStarsPayload {
  packId: string;
  userId: string;
  checkoutId?: string;
}

export interface UserStarPayment {
  id: number;
  packId: string;
  diamonds: number;
  priceStars: number;
  currency: string;
  createdAt: Date;
}

export function listStarsDiamondPacks(): StarsDiamondPack[] {
  return STARS_DIAMOND_PACKS.map((pack) => ({ ...pack }));
}

export function buildStarsInvoicePayload(userId: string, packId: string, checkoutId?: string): string {
  return [
    `pack=${packId}`,
    `user=${userId}`,
    checkoutId ? `checkout=${checkoutId}` : null,
  ].filter((part): part is string => part !== null).join(';');
}

export function parseStarsInvoicePayload(payload: string): ParsedStarsPayload | null {
  const parts = payload
    .split(';')
    .map((part) => part.split('=', 2))
    .filter((part): part is [string, string] => part.length === 2)
    .reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});

  if (!parts.pack || !parts.user) {
    return null;
  }

  return {
    packId: parts.pack,
    userId: parts.user,
    checkoutId: parts.checkout,
  };
}

function packTitle(pack: StarsDiamondPack, locale: Locale): string {
  return locale === 'ru' ? `${pack.diamonds} алмазов` : `${pack.diamonds} Diamonds`;
}

function packDescription(pack: StarsDiamondPack, locale: Locale): string {
  return locale === 'ru'
    ? `Пополнение баланса New Universe: ${pack.diamonds} алмазов.`
    : `New Universe balance top-up: ${pack.diamonds} diamonds.`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function safeTelegramChatId(chatId: bigint): number | null {
  const min = BigInt(Number.MIN_SAFE_INTEGER);
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (chatId < min || chatId > max) {
    logger.warn({ chatId: chatId.toString() }, 'Skipping unsafe Telegram chat id');
    return null;
  }
  return Number(chatId);
}

export function configuredAdminSupportChatIds(): number[] {
  const source = env.ADMIN_TELEGRAM_CHAT_IDS.length > 0
    ? env.ADMIN_TELEGRAM_CHAT_IDS
    : env.ADMIN_TELEGRAM_IDS;

  return source
    .map(safeTelegramChatId)
    .filter((chatId): chatId is number => chatId !== null);
}

export function isAdminSupportContext(chatId: number, actor?: TelegramUser): boolean {
  const actorId = actor?.id != null ? BigInt(actor.id) : null;
  const adminActor = actorId !== null && env.ADMIN_TELEGRAM_IDS.includes(actorId);
  const chat = BigInt(chatId);
  const adminChatSource = env.ADMIN_TELEGRAM_CHAT_IDS.length > 0
    ? env.ADMIN_TELEGRAM_CHAT_IDS
    : env.ADMIN_TELEGRAM_IDS;
  const adminChat = adminChatSource.includes(chat);

  return adminActor || adminChat;
}

export async function createStarsInvoiceLinkForUser(input: {
  userId: string;
  packId: string;
  locale: Locale;
}): Promise<{ invoiceUrl: string; pack: StarsDiamondPack; checkoutId: string }> {
  const pack = findStarsDiamondPack(input.packId);
  if (!pack) {
    throw new Error('Unknown Stars diamond pack.');
  }

  const user = await defaultDb.query.users.findFirst({
    where: eq(users.id, input.userId),
    columns: { id: true },
  });

  if (!user) {
    throw new Error('User not found.');
  }

  const checkoutId = randomUUID();
  const invoiceUrl = await createTelegramInvoiceLink({
    title: packTitle(pack, input.locale),
    description: packDescription(pack, input.locale),
    payload: buildStarsInvoicePayload(input.userId, pack.id, checkoutId),
    currency: TELEGRAM_STARS_CURRENCY,
    prices: [{ label: packTitle(pack, input.locale), amount: pack.priceStars }],
  });

  if (!invoiceUrl) {
    throw new Error('Failed to create Stars invoice.');
  }

  return { invoiceUrl, pack, checkoutId };
}

export async function answerStarsPreCheckout(query: TelegramPreCheckoutQuery): Promise<boolean> {
  const parsed = parseStarsInvoicePayload(query.invoice_payload);
  const pack = parsed ? findStarsDiamondPack(parsed.packId) : null;
  const user = parsed
    ? await defaultDb.query.users.findFirst({
      where: eq(users.id, parsed.userId),
      columns: { tgId: true },
    })
    : null;

  const valid =
    Boolean(parsed && pack && user) &&
    query.currency === TELEGRAM_STARS_CURRENCY &&
    query.total_amount === pack!.priceStars &&
    user!.tgId === BigInt(query.from.id);

  await answerPreCheckoutQuery(
    query.id,
    valid,
    valid ? undefined : 'This Stars purchase is no longer available.',
  );

  return valid;
}

export async function recordSuccessfulStarsPayment(input: {
  payment: TelegramSuccessfulPayment;
  actor?: TelegramUser;
}): Promise<{
  success: boolean;
  duplicate?: boolean;
  paymentId?: number;
  userId?: string;
  pack?: StarsDiamondPack;
  diamondsRemaining?: number;
  reason?: string;
}> {
  const parsed = parseStarsInvoicePayload(input.payment.invoice_payload);
  const pack = parsed ? findStarsDiamondPack(parsed.packId) : null;

  if (!parsed || !pack) {
    return { success: false, reason: 'invalid_payload' };
  }

  if (
    input.payment.currency !== TELEGRAM_STARS_CURRENCY ||
    input.payment.total_amount !== pack.priceStars
  ) {
    return { success: false, reason: 'amount_mismatch' };
  }

  const user = await defaultDb.query.users.findFirst({
    where: eq(users.id, parsed.userId),
    columns: { id: true, tgId: true },
  });

  if (!user) {
    return { success: false, reason: 'user_not_found' };
  }

  if (input.actor?.id != null && user.tgId !== BigInt(input.actor.id)) {
    return { success: false, reason: 'user_mismatch' };
  }

  return defaultDb.transaction(async (tx) => {
    const existing = await tx.query.starPayments.findFirst({
      where: eq(starPayments.telegramPaymentChargeId, input.payment.telegram_payment_charge_id),
      columns: { id: true },
    });

    if (existing) {
      return {
        success: true,
        duplicate: true,
        paymentId: existing.id,
        userId: user.id,
        pack,
      };
    }

    const [created] = await tx
      .insert(starPayments)
      .values({
        userId: user.id,
        packId: pack.id,
        diamonds: pack.diamonds,
        priceStars: pack.priceStars,
        currency: input.payment.currency,
        invoicePayload: input.payment.invoice_payload,
        telegramPaymentChargeId: input.payment.telegram_payment_charge_id,
        providerPaymentChargeId: input.payment.provider_payment_charge_id,
      })
      .returning({ id: starPayments.id });

    const [updatedUser] = await tx
      .update(users)
      .set({ diamonds: sql`${users.diamonds} + ${pack.diamonds}` })
      .where(eq(users.id, user.id))
      .returning({ diamonds: users.diamonds });

    return {
      success: true,
      duplicate: false,
      paymentId: created!.id,
      userId: user.id,
      pack,
      diamondsRemaining: Number(updatedUser!.diamonds),
    };
  });
}

export async function confirmStarsCheckoutForUser(input: {
  userId: string;
  packId: string;
  checkoutId: string;
}): Promise<ConfirmStarsCheckoutResponse> {
  const pack = findStarsDiamondPack(input.packId);
  if (!pack) {
    throw new Error('Unknown Stars diamond pack.');
  }

  const user = await defaultDb.query.users.findFirst({
    where: eq(users.id, input.userId),
    columns: { id: true, tgId: true, diamonds: true },
  });

  if (!user) {
    throw new Error('User not found.');
  }

  const invoicePayload = buildStarsInvoicePayload(user.id, pack.id, input.checkoutId);
  const existing = await defaultDb.query.starPayments.findFirst({
    where: and(
      eq(starPayments.userId, user.id),
      eq(starPayments.invoicePayload, invoicePayload),
      eq(starPayments.refunded, false),
    ),
    columns: { id: true },
  });

  if (existing) {
    return {
      status: 'delivered',
      pack,
      credited: false,
      paymentId: existing.id,
      diamondsRemaining: Number(user.diamonds),
    };
  }

  const history = await getStarTransactions({ limit: 100 });
  if (!history) {
    return {
      status: 'failed',
      pack,
      credited: false,
    };
  }

  const telegramUserId = Number(user.tgId);
  const transaction = history.transactions.find((candidate) => (
    isInvoicePaymentFromTelegramUser(candidate) &&
    candidate.source.user.id === telegramUserId &&
    candidate.source.invoice_payload === invoicePayload &&
    candidate.amount === pack.priceStars
  ));

  if (!transaction || !isInvoicePaymentFromTelegramUser(transaction)) {
    return {
      status: 'pending',
      pack,
      credited: false,
    };
  }

  const recorded = await recordSuccessfulStarsPayment({
    actor: transaction.source.user,
    payment: {
      currency: TELEGRAM_STARS_CURRENCY,
      total_amount: transaction.amount,
      invoice_payload: invoicePayload,
      telegram_payment_charge_id: transaction.id,
    },
  });

  if (!recorded.success) {
    return {
      status: 'failed',
      pack,
      credited: false,
    };
  }

  if (!recorded.duplicate) {
    trackBackendEvent('stars_checkout_completed', {
      packDiamonds: pack.diamonds,
      priceStars: pack.priceStars,
    }, {
      userId: user.id,
    });
  }

  const deliveredUser = await defaultDb.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { diamonds: true },
  });

  return {
    status: 'delivered',
    pack,
    credited: !recorded.duplicate,
    paymentId: recorded.paymentId,
    diamondsRemaining: Number(recorded.diamondsRemaining ?? deliveredUser?.diamonds ?? user.diamonds),
  };
}

export async function listRefundableStarPayments(userId: string): Promise<UserStarPayment[]> {
  const rows = await defaultDb
    .select({
      id: starPayments.id,
      packId: starPayments.packId,
      diamonds: starPayments.diamonds,
      priceStars: starPayments.priceStars,
      currency: starPayments.currency,
      createdAt: starPayments.createdAt,
    })
    .from(starPayments)
    .where(and(eq(starPayments.userId, userId), eq(starPayments.refunded, false)))
    .orderBy(desc(starPayments.createdAt));

  return rows;
}

function isInvoicePaymentFromTelegramUser(
  transaction: TelegramStarTransaction,
): transaction is TelegramStarTransaction & {
  source: {
    type: 'user';
    transaction_type?: string;
    user: TelegramUser;
    invoice_payload?: string;
  };
} {
  const source = transaction.source as Partial<{
    type: string;
    transaction_type: string;
    user: TelegramUser;
    invoice_payload: string;
  }> | undefined;

  return (
    transaction.amount > 0 &&
    source?.type === 'user' &&
    source.transaction_type === 'invoice_payment' &&
    typeof source.user?.id === 'number' &&
    typeof source.invoice_payload === 'string' &&
    source.invoice_payload.length > 0
  );
}

export async function reconcileMissingStarPaymentsForUser(input: {
  userId: string;
  telegramUserId: bigint;
  limit?: number;
}): Promise<{ scanned: number; recorded: number }> {
  const history = await getStarTransactions({ limit: input.limit ?? 100 });
  const transactions = history?.transactions ?? [];
  const telegramUserId = Number(input.telegramUserId);
  let recorded = 0;

  for (const transaction of transactions) {
    if (!isInvoicePaymentFromTelegramUser(transaction)) {
      continue;
    }

    const payload = transaction.source.invoice_payload!;
    const parsed = parseStarsInvoicePayload(payload);
    const pack = parsed ? findStarsDiamondPack(parsed.packId) : null;

    if (
      !parsed ||
      !pack ||
      parsed.userId !== input.userId ||
      transaction.amount !== pack.priceStars ||
      transaction.source.user.id !== telegramUserId
    ) {
      continue;
    }

    const result = await recordSuccessfulStarsPayment({
      actor: transaction.source.user,
      payment: {
        currency: TELEGRAM_STARS_CURRENCY,
        total_amount: transaction.amount,
        invoice_payload: payload,
        telegram_payment_charge_id: transaction.id,
      },
    });

    if (result.success && !result.duplicate) {
      recorded += 1;
    }
  }

  if (recorded > 0) {
    logger.info(
      {
        event: 'stars.reconcile.recorded',
        userId: input.userId,
        scanned: transactions.length,
        recorded,
      },
      'Recorded missing Telegram Stars payments from transaction history',
    );
  }

  return { scanned: transactions.length, recorded };
}

export async function createPaymentSupportRequest(input: {
  userId: string;
  paymentId: number;
  reason: string;
}): Promise<{ ok: true; requestId: number; payment: UserStarPayment } | { ok: false; reason: 'not_found' | 'duplicate' }> {
  const payment = await defaultDb.query.starPayments.findFirst({
    where: and(
      eq(starPayments.id, input.paymentId),
      eq(starPayments.userId, input.userId),
      eq(starPayments.refunded, false),
    ),
  });

  if (!payment) {
    return { ok: false, reason: 'not_found' };
  }

  const existing = await defaultDb.query.starPaymentSupportRequests.findFirst({
    where: and(
      eq(starPaymentSupportRequests.paymentId, payment.id),
      inArray(starPaymentSupportRequests.status, [...OPEN_SUPPORT_STATUSES]),
    ),
    columns: { id: true },
  });

  if (existing) {
    return { ok: false, reason: 'duplicate' };
  }

  const [request] = await defaultDb
    .insert(starPaymentSupportRequests)
    .values({
      userId: input.userId,
      paymentId: payment.id,
      reason: input.reason,
      status: 'pending',
    })
    .returning({ id: starPaymentSupportRequests.id });

  return {
    ok: true,
    requestId: request!.id,
    payment: {
      id: payment.id,
      packId: payment.packId,
      diamonds: payment.diamonds,
      priceStars: payment.priceStars,
      currency: payment.currency,
      createdAt: payment.createdAt,
    },
  };
}

export async function notifyAdminsAboutSupportRequest(input: {
  requestId: number;
  chatId: number;
  payment: UserStarPayment;
  reason: string;
}) {
  const adminChatIds = configuredAdminSupportChatIds();
  if (adminChatIds.length === 0) {
    logger.warn({ requestId: input.requestId }, 'No admin support chat ids configured for payment support request');
    return;
  }

  const safeReason = input.reason.trim() ? escapeHtml(input.reason.trim()) : 'not provided / не указана';
  const message =
    `Запрос возврата #${input.requestId}\n` +
    `Refund request #${input.requestId}\n\n` +
    `Чат игрока: <code>${input.chatId}</code>\n` +
    `Player chat: <code>${input.chatId}</code>\n` +
    `Платеж: <code>${input.payment.id}</code>, ${input.payment.diamonds} алмазов за ${input.payment.priceStars} Stars\n` +
    `Payment: <code>${input.payment.id}</code>, ${input.payment.diamonds} diamonds for ${input.payment.priceStars} Stars\n` +
    `Причина: ${safeReason}\n\n` +
    `<code>/refund ${input.requestId}</code> - approve refund / подтвердить возврат\n` +
    `<code>/reject ${input.requestId} reason</code> - reject / отклонить\n` +
    `<code>/ask ${input.requestId} question</code> - ask for details / уточнить`;

  await Promise.all(adminChatIds.map((adminChatId) => sendTelegramMessage(adminChatId, message)));
}

export async function latestInfoSupportRequest(userId: string): Promise<number | null> {
  const row = await defaultDb.query.starPaymentSupportRequests.findFirst({
    where: and(
      eq(starPaymentSupportRequests.userId, userId),
      eq(starPaymentSupportRequests.status, 'info_requested'),
    ),
    orderBy: [desc(starPaymentSupportRequests.updatedAt)],
    columns: { id: true },
  });

  return row?.id ?? null;
}

export async function answerPaymentSupportRequest(input: {
  requestId: number;
  userId: string;
  answer: string;
}): Promise<boolean> {
  const request = await defaultDb.query.starPaymentSupportRequests.findFirst({
    where: and(
      eq(starPaymentSupportRequests.id, input.requestId),
      eq(starPaymentSupportRequests.userId, input.userId),
    ),
    columns: { id: true },
  });

  if (!request) {
    return false;
  }

  await defaultDb
    .update(starPaymentSupportRequests)
    .set({
      status: 'pending',
      adminMessage: input.answer,
      updatedAt: new Date(),
    })
    .where(eq(starPaymentSupportRequests.id, request.id));

  const adminChatIds = configuredAdminSupportChatIds();
  const message =
    `Ответ по запросу возврата #${input.requestId} / Reply for refund request #${input.requestId}:\n` +
    `${escapeHtml(input.answer)}\n\n` +
    `<code>/refund ${input.requestId}</code> - approve refund / подтвердить возврат\n` +
    `<code>/reject ${input.requestId} reason</code> - reject / отклонить\n` +
    `<code>/ask ${input.requestId} question</code> - ask for details / уточнить`;
  await Promise.all(adminChatIds.map((adminChatId) => sendTelegramMessage(adminChatId, message)));

  return true;
}

export async function refundPaymentSupportRequest(input: {
  requestId: number;
  adminMessage?: string;
}): Promise<{
  ok: boolean;
  userTelegramId?: number;
  userLocale?: Locale;
  payment?: UserStarPayment;
  reason?: 'not_found' | 'already_refunded' | 'telegram_failed';
}> {
  const request = await defaultDb.query.starPaymentSupportRequests.findFirst({
    where: eq(starPaymentSupportRequests.id, input.requestId),
  });

  if (!request?.paymentId) {
    return { ok: false, reason: 'not_found' };
  }

  const payment = await defaultDb.query.starPayments.findFirst({
    where: eq(starPayments.id, request.paymentId),
  });

  const user = await defaultDb.query.users.findFirst({
    where: eq(users.id, request.userId),
    columns: { tgId: true, preferredLocale: true },
  });

  if (!payment || !user) {
    return { ok: false, reason: 'not_found' };
  }

  if (payment.refunded) {
    return { ok: false, reason: 'already_refunded' };
  }

  const refundOk = await refundStarPayment({
    userId: Number(user.tgId),
    telegramPaymentChargeId: payment.telegramPaymentChargeId,
  });

  if (!refundOk) {
    await defaultDb
      .update(starPaymentSupportRequests)
      .set({
        status: 'refund_failed',
        adminMessage: input.adminMessage ?? null,
        updatedAt: new Date(),
      })
      .where(eq(starPaymentSupportRequests.id, request.id));
    return { ok: false, reason: 'telegram_failed' };
  }

  await defaultDb.transaction(async (tx) => {
    await tx
      .update(starPayments)
      .set({ refunded: true, refundedAt: new Date() })
      .where(eq(starPayments.id, payment.id));

    await tx
      .update(users)
      .set({ diamonds: sql`${users.diamonds} - ${payment.diamonds}` })
      .where(eq(users.id, request.userId));

    await tx
      .update(starPaymentSupportRequests)
      .set({
        status: 'refunded',
        adminMessage: input.adminMessage ?? null,
        updatedAt: new Date(),
        resolvedAt: new Date(),
      })
      .where(eq(starPaymentSupportRequests.id, request.id));
  });

  trackBackendEvent('stars_refund_issued', {
    packDiamonds: payment.diamonds,
    priceStars: payment.priceStars,
    reasonCode: 'admin_approved',
  }, {
    userId: request.userId,
  });

  return {
    ok: true,
    userTelegramId: Number(user.tgId),
    userLocale: user.preferredLocale as Locale,
    payment: {
      id: payment.id,
      packId: payment.packId,
      diamonds: payment.diamonds,
      priceStars: payment.priceStars,
      currency: payment.currency,
      createdAt: payment.createdAt,
    },
  };
}

export async function rejectPaymentSupportRequest(input: {
  requestId: number;
  reason: string;
}): Promise<{ ok: boolean; userTelegramId?: number; userLocale?: Locale }> {
  const request = await defaultDb.query.starPaymentSupportRequests.findFirst({
    where: eq(starPaymentSupportRequests.id, input.requestId),
  });

  if (!request) {
    return { ok: false };
  }

  const user = await defaultDb.query.users.findFirst({
    where: eq(users.id, request.userId),
    columns: { tgId: true, preferredLocale: true },
  });

  await defaultDb
    .update(starPaymentSupportRequests)
    .set({
      status: 'rejected',
      adminMessage: input.reason,
      updatedAt: new Date(),
      resolvedAt: new Date(),
    })
    .where(eq(starPaymentSupportRequests.id, request.id));

  return {
    ok: true,
    userTelegramId: user ? Number(user.tgId) : undefined,
    userLocale: user?.preferredLocale as Locale | undefined,
  };
}

export async function askPaymentSupportRequest(input: {
  requestId: number;
  question: string;
}): Promise<{ ok: boolean; userTelegramId?: number; userLocale?: Locale }> {
  const request = await defaultDb.query.starPaymentSupportRequests.findFirst({
    where: eq(starPaymentSupportRequests.id, input.requestId),
  });

  if (!request) {
    return { ok: false };
  }

  const user = await defaultDb.query.users.findFirst({
    where: eq(users.id, request.userId),
    columns: { tgId: true, preferredLocale: true },
  });

  await defaultDb
    .update(starPaymentSupportRequests)
    .set({
      status: 'info_requested',
      adminMessage: input.question,
      updatedAt: new Date(),
    })
    .where(eq(starPaymentSupportRequests.id, request.id));

  return {
    ok: true,
    userTelegramId: user ? Number(user.tgId) : undefined,
    userLocale: user?.preferredLocale as Locale | undefined,
  };
}
