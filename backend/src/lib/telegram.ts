import crypto from 'crypto';
import { env } from './env.js';
import { logger } from './logger.js';
import { constantTimeEqual } from './security.js';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
}

export interface TelegramInitData {
  user?: TelegramUser;
  chat_instance?: string;
  chat_type?: string;
  auth_date: number;
  hash: string;
}

export const TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = 60 * 60;
export const TELEGRAM_INIT_DATA_FUTURE_SKEW_SECONDS = 60;

/**
 * Validates Telegram Mini App initData.
 * Algorithm: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateTelegramInitData(initData: string, botToken: string): TelegramInitData | null {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');

  if (!hash) {
    return null;
  }

  const dataToCheck: string[] = [];
  urlParams.sort();
  urlParams.forEach((val, key) => {
    if (key !== 'hash') {
      dataToCheck.push(`${key}=${val}`);
    }
  });

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const checkHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataToCheck.join('\n'))
    .digest('hex');

  if (!constantTimeEqual(checkHash, hash)) {
    return null;
  }

  const rawAuthDate = urlParams.get('auth_date');
  if (!rawAuthDate || !/^\d+$/.test(rawAuthDate)) {
    return null;
  }

  const authDate = Number.parseInt(rawAuthDate, 10);
  if (!Number.isSafeInteger(authDate) || authDate <= 0) {
    return null;
  }

  const userJson = urlParams.get('user');
  let user: TelegramUser | undefined;

  if (userJson) {
    try {
      user = JSON.parse(userJson);
    } catch {
      // Ignore parse errors for user
    }
  }

  return {
    user,
    chat_instance: urlParams.get('chat_instance') || undefined,
    chat_type: urlParams.get('chat_type') || undefined,
    auth_date: authDate,
    hash,
  };
}

/**
 * Checks whether auth_date is outside the accepted replay window.
 */
export function isInitDataExpired(
  authDate: number,
  maxAgeInSeconds = TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
  maxFutureSkewInSeconds = TELEGRAM_INIT_DATA_FUTURE_SKEW_SECONDS,
): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(authDate) || authDate <= 0) {
    return true;
  }

  if (authDate - now > maxFutureSkewInSeconds) {
    return true;
  }

  return now - authDate > maxAgeInSeconds;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  pre_checkout_query?: TelegramPreCheckoutQuery;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: {
    id: number;
    type: 'private' | 'group' | 'supergroup' | 'channel';
  };
  text?: string;
  successful_payment?: TelegramSuccessfulPayment;
  entities?: Array<{
    type: 'bot_command' | 'url' | 'mention' | string;
    offset: number;
    length: number;
  }>;
}

export interface TelegramPreCheckoutQuery {
  id: string;
  from: TelegramUser;
  currency: string;
  total_amount: number;
  invoice_payload: string;
}

export interface TelegramSuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface InlineKeyboardButton {
  text: string;
  url?: string;
  web_app?: {
    url: string;
  };
  callback_data?: string;
}

interface TelegramBotApiResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

export async function callTelegramBotApi<T>(
  method: string,
  body: Record<string, unknown>,
): Promise<T | null> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => null) as TelegramBotApiResponse<T> | null;

    if (!response.ok || data?.ok === false) {
      logger.error(
        {
          method,
          status: response.status,
          errorCode: data?.error_code,
          description: data?.description,
        },
        'Telegram Bot API call failed',
      );
      return null;
    }

    return data?.result ?? null;
  } catch (error) {
    logger.error({ error, method }, 'Error calling Telegram Bot API');
    return null;
  }
}

export async function sendTelegramMessage(chatId: number, text: string, options?: {
  reply_markup?: {
    inline_keyboard: InlineKeyboardButton[][];
  };
}) {
  return callTelegramBotApi('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: options?.reply_markup,
    parse_mode: 'HTML',
  });
}

export async function answerPreCheckoutQuery(
  preCheckoutQueryId: string,
  ok: boolean,
  errorMessage?: string,
) {
  return callTelegramBotApi<boolean>('answerPreCheckoutQuery', {
    pre_checkout_query_id: preCheckoutQueryId,
    ok,
    error_message: ok ? undefined : errorMessage,
  });
}

export async function createTelegramInvoiceLink(input: {
  title: string;
  description: string;
  payload: string;
  currency: string;
  prices: Array<{ label: string; amount: number }>;
}) {
  return callTelegramBotApi<string>('createInvoiceLink', {
    title: input.title,
    description: input.description,
    payload: input.payload,
    provider_token: '',
    currency: input.currency,
    prices: input.prices,
  });
}

export async function refundStarPayment(input: {
  userId: number;
  telegramPaymentChargeId: string;
}) {
  return callTelegramBotApi<boolean>('refundStarPayment', {
    user_id: input.userId,
    telegram_payment_charge_id: input.telegramPaymentChargeId,
  });
}
