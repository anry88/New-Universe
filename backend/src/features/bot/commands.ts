import { TelegramUser, sendTelegramMessage } from '../../lib/telegram.js';
import { env } from '../../lib/env.js';
import { logger } from '../../lib/logger.js';
import { grantDiamondsToUserByUsername } from '../resources/wallet.js';

type BotLocale = 'en' | 'ru';

const ALLOWED_DIAMOND_COMMANDS = new Set([
  '/add_diamond',
  '/adddiamonds',
  '/add_diamonds',
  '/add_diamond_ru',
]);

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

function trimUsername(raw: string): string {
  return raw.replace(/^@/, '').trim().toLowerCase();
}

export async function handleStartCommand(chatId: number) {
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

  if (!isAdmin) {
    await sendTelegramMessage(chatId, messages.unauthorized);
    logger.warn({ chatId, actorId: actor?.id }, 'Admin diamonds command rejected: actor is not in allowlist');
    return;
  }

  if (args.length !== 2) {
    await sendTelegramMessage(chatId, messages.insufficientArgs);
    return;
  }

  const username = trimUsername(args[0] ?? '');
  const amountRaw = args[1];
  const amount = Number(amountRaw);

  if (!username || Number.isNaN(amount) || !Number.isInteger(amount) || amount < 0) {
    const message = !username ? messages.invalidUsername : messages.invalidAmount;
    await sendTelegramMessage(chatId, message);
    return;
  }

  const result = await grantDiamondsToUserByUsername({ username, amount });

  if (!result.success) {
    if (result.status === 404) {
      await sendTelegramMessage(chatId, messages.userNotFound);
      return;
    }

    await sendTelegramMessage(chatId, messages.operationFailed);
    return;
  }

  logger.info(
    {
      event: 'admin.add_diamond',
      actorId: actorId,
      chatId,
      targetUserId: result.data?.userId,
      targetUsername: result.data?.username,
      amount,
    },
    'Admin added diamonds via Telegram command',
  );

  await sendTelegramMessage(
    chatId,
    messages.grantSuccess(result.data!.username, result.data!.granted, result.data!.diamondsAfter),
  );
}
