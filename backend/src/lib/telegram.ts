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
  callback_query?: any;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: {
    id: number;
    type: 'private' | 'group' | 'supergroup' | 'channel';
  };
  text?: string;
  entities?: Array<{
    type: 'bot_command' | 'url' | 'mention' | string;
    offset: number;
    length: number;
  }>;
}

export interface InlineKeyboardButton {
  text: string;
  url?: string;
  web_app?: {
    url: string;
  };
  callback_data?: string;
}

export async function sendTelegramMessage(chatId: number, text: string, options?: {
  reply_markup?: {
    inline_keyboard: InlineKeyboardButton[][];
  };
}) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup: options?.reply_markup,
        parse_mode: 'HTML',
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      logger.error({ data, chatId }, 'Failed to send Telegram message');
      return null;
    }

    return data;
  } catch (error) {
    logger.error({ error, chatId }, 'Error calling Telegram Bot API');
    return null;
  }
}
