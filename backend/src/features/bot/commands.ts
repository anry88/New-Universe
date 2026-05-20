import { and, eq, isNotNull } from 'drizzle-orm';
import { TelegramUser, sendTelegramMessage } from '../../lib/telegram.js';
import { env } from '../../lib/env.js';
import { logger } from '../../lib/logger.js';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { grantDiamondsToUserByUsername } from '../resources/wallet.js';
import {
  answerPaymentSupportRequest,
  askPaymentSupportRequest,
  createPaymentSupportRequest,
  isAdminSupportContext,
  latestInfoSupportRequest,
  listRefundableStarPayments,
  notifyAdminsAboutSupportRequest,
  reconcileMissingStarPaymentsForUser,
  refundPaymentSupportRequest,
  rejectPaymentSupportRequest,
  type UserStarPayment,
} from '../monetization/service.js';

type BotLocale = 'en' | 'ru';

const ALLOWED_DIAMOND_COMMANDS = new Set([
  '/add_diamond',
  '/adddiamonds',
  '/add_diamonds',
  '/add_diamond_ru',
]);

const PAY_SUPPORT_COMMANDS = new Set(['/paysupport']);
const ANSWER_SUPPORT_COMMANDS = new Set(['/answer']);
const ADMIN_REFUND_COMMANDS = new Set(['/refund']);
const ADMIN_REJECT_COMMANDS = new Set(['/reject']);
const ADMIN_ASK_COMMANDS = new Set(['/ask']);

const LOCALE_MESSAGES = {
  ru: {
    invalidAmount: 'Количество должно быть целым числом >= 0.',
    invalidUsername: 'Ник не найден или некорректен.',
    userNotFound: 'Пользователь с таким ником не найден.',
    unauthorized: 'Доступ запрещен: команда доступна только администраторам.',
    insufficientArgs: 'Укажите ник и количество (например: /add_diamond @captain 100).',
    grantSuccess: (username: string, amount: number, balance: number) =>
      `Админ-операция: начислено ${amount} алмазов игроку @${username}. Новый баланс: ${balance}.`,
    operationFailed: 'Не удалось начислить алмазы.',
    noAccount: 'Игровой аккаунт не найден. Откройте Mini App и войдите в игру, затем повторите команду.',
    noPurchases: 'Покупок за Stars для возврата не найдено.',
    supportList: (list: string) =>
      `Выберите покупку для возврата: /paysupport &lt;ID&gt; &lt;причина&gt;\n${list}`,
    supportRecovered: (list: string) =>
      `Мы нашли и начислили пропущенную оплату Stars. Баланс обновлен.\nЕсли нужен возврат, отправьте команду еще раз: /paysupport &lt;ID&gt; &lt;причина&gt;\n${list}`,
    supportInvalid: 'Неверный формат. Используйте /paysupport &lt;ID&gt; &lt;причина&gt;.',
    supportReasonRequired: 'Добавьте причину возврата после ID покупки.',
    supportDuplicate: 'По этой покупке уже есть открытый запрос.',
    supportNotFound: 'Покупка не найдена или уже возвращена.',
    supportSubmitted: (id: number) => `Запрос возврата #${id} отправлен администрации.`,
    answerInvalid: 'Укажите запрос и ответ: /answer &lt;ID&gt; &lt;ответ&gt;.',
    answerSent: 'Ответ отправлен администрации.',
    requestNotFound: 'Запрос не найден.',
    adminUnauthorized: 'Эта команда доступна только в админском чате или администраторам.',
    adminInvalid: 'Неверный формат команды.',
    adminRefunded: (id: number) => `Возврат по запросу #${id} подтвержден.`,
    adminRefundFailed: (reason: string) => `Не удалось выполнить возврат: ${reason}.`,
    adminRejected: (id: number) => `Запрос #${id} отклонен.`,
    adminAsked: (id: number) => `Вопрос по запросу #${id} отправлен игроку.`,
    playerRefunded: (id: number) => `Ваш запрос возврата #${id} одобрен. Stars вернутся через Telegram, купленные алмазы списаны с баланса.`,
    playerRejected: (id: number, reason: string) => `Запрос возврата #${id} отклонен: ${reason}`,
    playerAsked: (id: number, question: string) => `Администратор уточняет по запросу #${id}: ${question}\nОтветьте командой /answer ${id} &lt;ответ&gt;.`,
  },
  en: {
    invalidAmount: 'Amount must be an integer >= 0.',
    invalidUsername: 'Username is invalid or missing.',
    userNotFound: 'User with that username was not found.',
    unauthorized: 'Access denied: this command is for administrators only.',
    insufficientArgs: 'Provide username and amount (for example: /add_diamond @captain 100).',
    grantSuccess: (username: string, amount: number, balance: number) =>
      `Admin action: granted ${amount} diamonds to @${username}. New balance: ${balance}.`,
    operationFailed: 'Failed to grant diamonds.',
    noAccount: 'Game account was not found. Open the Mini App and log in, then run the command again.',
    noPurchases: 'No refundable Stars purchases found.',
    supportList: (list: string) =>
      `Choose a purchase for refund: /paysupport &lt;ID&gt; &lt;reason&gt;\n${list}`,
    supportRecovered: (list: string) =>
      `We found and delivered a missing Stars purchase. Your balance is updated.\nIf you still need a refund, send the command again: /paysupport &lt;ID&gt; &lt;reason&gt;\n${list}`,
    supportInvalid: 'Invalid format. Use /paysupport &lt;ID&gt; &lt;reason&gt;.',
    supportReasonRequired: 'Add a refund reason after the purchase ID.',
    supportDuplicate: 'This purchase already has an open support request.',
    supportNotFound: 'Purchase was not found or is already refunded.',
    supportSubmitted: (id: number) => `Refund request #${id} has been sent to the admins.`,
    answerInvalid: 'Provide a request and reply: /answer &lt;ID&gt; &lt;message&gt;.',
    answerSent: 'Your reply has been sent to the admins.',
    requestNotFound: 'Request was not found.',
    adminUnauthorized: 'This command is only available in the admin chat or to administrators.',
    adminInvalid: 'Invalid command format.',
    adminRefunded: (id: number) => `Refund request #${id} has been approved.`,
    adminRefundFailed: (reason: string) => `Refund failed: ${reason}.`,
    adminRejected: (id: number) => `Request #${id} has been rejected.`,
    adminAsked: (id: number) => `Question for request #${id} has been sent to the player.`,
    playerRefunded: (id: number) => `Your refund request #${id} was approved. Telegram will return the Stars, and purchased diamonds were removed from your balance.`,
    playerRejected: (id: number, reason: string) => `Refund request #${id} was rejected: ${reason}`,
    playerAsked: (id: number, question: string) => `Admin asks about request #${id}: ${question}\nReply with /answer ${id} &lt;message&gt;.`,
  },
} as const;

function resolveLocale(languageCode?: string): BotLocale {
  if (!languageCode) {
    return 'en';
  }

  return languageCode.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export function isAddDiamondCommand(commandText: string): boolean {
  return ALLOWED_DIAMOND_COMMANDS.has(commandText.toLowerCase());
}

export function isPaySupportCommand(commandText: string): boolean {
  return PAY_SUPPORT_COMMANDS.has(commandText.toLowerCase());
}

export function isAnswerSupportCommand(commandText: string): boolean {
  return ANSWER_SUPPORT_COMMANDS.has(commandText.toLowerCase());
}

export function isAdminRefundCommand(commandText: string): boolean {
  return ADMIN_REFUND_COMMANDS.has(commandText.toLowerCase());
}

export function isAdminRejectCommand(commandText: string): boolean {
  return ADMIN_REJECT_COMMANDS.has(commandText.toLowerCase());
}

export function isAdminAskCommand(commandText: string): boolean {
  return ADMIN_ASK_COMMANDS.has(commandText.toLowerCase());
}

function trimUsername(raw: string): string {
  return raw.replace(/^@/, '').trim().toLowerCase();
}

function actorLogId(actor?: TelegramUser): string | null {
  return actor?.id != null ? String(actor.id) : null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatRefundablePaymentList(payments: UserStarPayment[], locale: BotLocale): string {
  return payments
    .map((payment) => {
      const label = `${payment.diamonds} ${locale === 'ru' ? 'алмазов' : 'diamonds'}`;
      return `<code>${payment.id}</code>: ${label} — ${payment.priceStars} Stars`;
    })
    .join('\n');
}

async function findUserByTelegramActor(actor?: TelegramUser) {
  if (actor?.id == null) {
    return null;
  }

  return db.query.users.findFirst({
    where: eq(users.tgId, BigInt(actor.id)),
    columns: {
      id: true,
      tgId: true,
      preferredLocale: true,
    },
  });
}

async function clearTelegramNotificationBlock(actor?: TelegramUser): Promise<void> {
  if (actor?.id == null) return;

  const updated = await db
    .update(users)
    .set({ telegramNotificationsBlockedAt: null })
    .where(and(
      eq(users.tgId, BigInt(actor.id)),
      isNotNull(users.telegramNotificationsBlockedAt),
    ))
    .returning({ id: users.id });

  if (updated.length > 0) {
    logger.info(
      { userId: updated[0].id, telegramUserId: String(actor.id) },
      'Telegram notification block cleared by /start',
    );
  }
}

export async function handleStartCommand(chatId: number, actor?: TelegramUser) {
  await clearTelegramNotificationBlock(actor);

  const appUrl = env.PUBLIC_FRONTEND_URL || 'https://new-universe.app';
  
  if (!env.PUBLIC_FRONTEND_URL) {
    logger.warn('PUBLIC_FRONTEND_URL is not set, using placeholder https://new-universe.app for /start button');
  }

  await sendTelegramMessage(chatId, 'Добро пожаловать в New Universe! 🚀\n\nВаша космическая империя ждет вас.', {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Открыть New Universe',
            web_app: {
              url: appUrl,
            },
          },
        ],
      ],
    },
  });
}

export async function handleAddDiamondCommand(
  chatId: number,
  args: string[],
  actor?: TelegramUser,
  options?: {
    adminTelegramIds?: bigint[];
    locale?: BotLocale;
  },
) {
  const locale = options?.locale ?? resolveLocale(actor?.language_code);
  const messages = LOCALE_MESSAGES[locale];
  const adminTelegramIds = options?.adminTelegramIds ?? env.ADMIN_TELEGRAM_IDS;

  const actorId = actor?.id != null ? BigInt(actor.id) : null;
  const isAdmin = actorId !== null && adminTelegramIds.includes(actorId);
  const actorIdForLog = actorLogId(actor);

  if (!isAdmin) {
    logger.warn(
      {
        event: 'admin.add_diamond.rejected',
        reason: 'unauthorized',
        chatId,
        actorId: actorIdForLog,
      },
      'Admin diamonds command rejected',
    );
    await sendTelegramMessage(chatId, messages.unauthorized);
    return;
  }

  if (args.length !== 2) {
    logger.warn(
      {
        event: 'admin.add_diamond.rejected',
        reason: 'invalid_syntax',
        chatId,
        actorId: actorIdForLog,
        argsCount: args.length,
      },
      'Admin diamonds command rejected',
    );
    await sendTelegramMessage(chatId, messages.insufficientArgs);
    return;
  }

  const username = trimUsername(args[0] ?? '');
  const amountRaw = args[1];
  const amount = Number(amountRaw);

  if (!username || Number.isNaN(amount) || !Number.isInteger(amount) || amount < 0) {
    const message = !username ? messages.invalidUsername : messages.invalidAmount;
    logger.warn(
      {
        event: 'admin.add_diamond.rejected',
        reason: !username ? 'invalid_username' : 'invalid_amount',
        chatId,
        actorId: actorIdForLog,
        targetUsername: username || null,
        amountRaw,
      },
      'Admin diamonds command rejected',
    );
    await sendTelegramMessage(chatId, message);
    return;
  }

  const result = await grantDiamondsToUserByUsername({ username, amount });

  if (!result.success) {
    if (result.status === 404) {
      logger.warn(
        {
          event: 'admin.add_diamond.rejected',
          reason: 'user_not_found',
          chatId,
          actorId: actorIdForLog,
          targetUsername: username,
        },
        'Admin diamonds command rejected',
      );
      await sendTelegramMessage(chatId, messages.userNotFound);
      return;
    }

    logger.error(
      {
        event: 'admin.add_diamond.failed',
        chatId,
        actorId: actorIdForLog,
        targetUsername: username,
        amount,
        status: result.status,
        error: result.error,
      },
      'Admin diamonds command failed',
    );
    await sendTelegramMessage(chatId, messages.operationFailed);
    return;
  }

  logger.info(
    {
      event: 'admin.add_diamond',
      actorId: actorIdForLog,
      chatId,
      targetUserId: result.data?.userId,
      targetUsername: result.data?.username,
      amount,
      diamondsBefore: result.data?.diamondsBefore,
      diamondsAfter: result.data?.diamondsAfter,
    },
    'Admin added diamonds via Telegram command',
  );

  await sendTelegramMessage(
    chatId,
    messages.grantSuccess(result.data!.username, result.data!.granted, result.data!.diamondsAfter),
  );
}

export async function handlePaySupportCommand(
  chatId: number,
  argsText: string,
  actor?: TelegramUser,
) {
  const locale = resolveLocale(actor?.language_code);
  const messages = LOCALE_MESSAGES[locale];
  const user = await findUserByTelegramActor(actor);

  if (!user) {
    await sendTelegramMessage(chatId, messages.noAccount);
    return;
  }

  const trimmedArgs = argsText.trim();
  let payments = await listRefundableStarPayments(user.id);
  let recoveredMissingPayment = false;
  if (payments.length === 0) {
    const reconciliation = await reconcileMissingStarPaymentsForUser({
      userId: user.id,
      telegramUserId: user.tgId,
    });
    payments = await listRefundableStarPayments(user.id);
    recoveredMissingPayment = reconciliation.recorded > 0;
  }

  if (recoveredMissingPayment) {
    if (payments.length === 0) {
      await sendTelegramMessage(chatId, messages.noPurchases);
      return;
    }

    const list = formatRefundablePaymentList(payments, locale);
    await sendTelegramMessage(chatId, messages.supportRecovered(list));
    return;
  }

  if (!trimmedArgs) {
    if (payments.length === 0) {
      await sendTelegramMessage(chatId, messages.noPurchases);
      return;
    }

    const list = formatRefundablePaymentList(payments, locale);
    await sendTelegramMessage(chatId, messages.supportList(list));
    return;
  }

  const [paymentIdRaw = '', reasonRaw] = trimmedArgs.split(/\s+/, 2);
  const paymentId = Number(paymentIdRaw);
  const reason = trimmedArgs.slice(paymentIdRaw.length).trim();

  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    await sendTelegramMessage(chatId, messages.supportInvalid);
    return;
  }

  if (!reasonRaw || !reason) {
    await sendTelegramMessage(chatId, messages.supportReasonRequired);
    return;
  }

  const result = await createPaymentSupportRequest({
    userId: user.id,
    paymentId,
    reason,
  });

  if (!result.ok) {
    await sendTelegramMessage(
      chatId,
      result.reason === 'duplicate' ? messages.supportDuplicate : messages.supportNotFound,
    );
    return;
  }

  logger.info(
    {
      event: 'stars.support_request.created',
      requestId: result.requestId,
      paymentId,
      userId: user.id,
    },
    'Stars payment support request created',
  );

  await sendTelegramMessage(chatId, messages.supportSubmitted(result.requestId));
  await notifyAdminsAboutSupportRequest({
    requestId: result.requestId,
    chatId,
    payment: result.payment,
    reason,
  });
}

export async function handleAnswerSupportCommand(
  chatId: number,
  argsText: string,
  actor?: TelegramUser,
) {
  const locale = resolveLocale(actor?.language_code);
  const messages = LOCALE_MESSAGES[locale];
  const user = await findUserByTelegramActor(actor);

  if (!user) {
    await sendTelegramMessage(chatId, messages.noAccount);
    return;
  }

  const trimmedArgs = argsText.trim();
  const [maybeId] = trimmedArgs.split(/\s+/, 1);
  let requestId = Number(maybeId);
  let answer = Number.isInteger(requestId) && requestId > 0
    ? trimmedArgs.slice(maybeId.length).trim()
    : trimmedArgs;

  if (!Number.isInteger(requestId) || requestId <= 0) {
    requestId = await latestInfoSupportRequest(user.id) ?? 0;
  }

  if (!requestId || !answer) {
    await sendTelegramMessage(chatId, messages.answerInvalid);
    return;
  }

  const ok = await answerPaymentSupportRequest({
    requestId,
    userId: user.id,
    answer,
  });

  await sendTelegramMessage(chatId, ok ? messages.answerSent : messages.requestNotFound);
}

export async function handleAdminRefundCommand(
  chatId: number,
  argsText: string,
  actor?: TelegramUser,
) {
  const locale = resolveLocale(actor?.language_code);
  const messages = LOCALE_MESSAGES[locale];

  if (!isAdminSupportContext(chatId, actor)) {
    await sendTelegramMessage(chatId, messages.adminUnauthorized);
    return;
  }

  const requestId = Number(argsText.trim().split(/\s+/, 1)[0]);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    await sendTelegramMessage(chatId, messages.adminInvalid);
    return;
  }

  const result = await refundPaymentSupportRequest({ requestId });
  if (!result.ok) {
    await sendTelegramMessage(chatId, messages.adminRefundFailed(result.reason ?? 'unknown'));
    return;
  }

  await sendTelegramMessage(chatId, messages.adminRefunded(requestId));
  if (result.userTelegramId) {
    const playerMessages = LOCALE_MESSAGES[result.userLocale ?? 'en'];
    await sendTelegramMessage(result.userTelegramId, playerMessages.playerRefunded(requestId));
  }
}

export async function handleAdminRejectCommand(
  chatId: number,
  argsText: string,
  actor?: TelegramUser,
) {
  const locale = resolveLocale(actor?.language_code);
  const messages = LOCALE_MESSAGES[locale];

  if (!isAdminSupportContext(chatId, actor)) {
    await sendTelegramMessage(chatId, messages.adminUnauthorized);
    return;
  }

  const parts = argsText.trim().split(/\s+/, 2);
  const requestId = Number(parts[0]);
  const reason = argsText.trim().slice((parts[0] ?? '').length).trim() || (locale === 'ru' ? 'Причина не указана' : 'Reason was not provided');

  if (!Number.isInteger(requestId) || requestId <= 0) {
    await sendTelegramMessage(chatId, messages.adminInvalid);
    return;
  }

  const result = await rejectPaymentSupportRequest({ requestId, reason });
  if (!result.ok) {
    await sendTelegramMessage(chatId, messages.requestNotFound);
    return;
  }

  await sendTelegramMessage(chatId, messages.adminRejected(requestId));
  if (result.userTelegramId) {
    const playerMessages = LOCALE_MESSAGES[result.userLocale ?? 'en'];
    await sendTelegramMessage(result.userTelegramId, playerMessages.playerRejected(requestId, escapeHtml(reason)));
  }
}

export async function handleAdminAskCommand(
  chatId: number,
  argsText: string,
  actor?: TelegramUser,
) {
  const locale = resolveLocale(actor?.language_code);
  const messages = LOCALE_MESSAGES[locale];

  if (!isAdminSupportContext(chatId, actor)) {
    await sendTelegramMessage(chatId, messages.adminUnauthorized);
    return;
  }

  const parts = argsText.trim().split(/\s+/, 2);
  const requestId = Number(parts[0]);
  const question = argsText.trim().slice((parts[0] ?? '').length).trim();

  if (!Number.isInteger(requestId) || requestId <= 0 || !question) {
    await sendTelegramMessage(chatId, messages.adminInvalid);
    return;
  }

  const result = await askPaymentSupportRequest({ requestId, question });
  if (!result.ok) {
    await sendTelegramMessage(chatId, messages.requestNotFound);
    return;
  }

  await sendTelegramMessage(chatId, messages.adminAsked(requestId));
  if (result.userTelegramId) {
    const playerMessages = LOCALE_MESSAGES[result.userLocale ?? 'en'];
    await sendTelegramMessage(result.userTelegramId, playerMessages.playerAsked(requestId, escapeHtml(question)));
  }
}
