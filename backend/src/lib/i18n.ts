import type { FastifyReply, FastifyRequest } from 'fastify';
import { DEFAULT_LOCALE, normalizeLocale, type Locale } from '@shared/types/locale.js';

type ApiErrorKey =
  | 'badRequest'
  | 'internalServerError'
  | 'invalidPreferredLocale'
  | 'invalidSessionToken'
  | 'invalidTelegramWebhookSecret'
  | 'invalidTelegramInitData'
  | 'missingSessionToken'
  | 'missingTelegramInitData'
  | 'missingTelegramUser'
  | 'rateLimitExceeded'
  | 'telegramInitDataExpired'
  | 'userNotFound';

const ERROR_TEXT: Record<ApiErrorKey, Record<Locale, { error: string; message: string }>> = {
  badRequest: {
    en: { error: 'Bad Request', message: 'Bad request' },
    ru: { error: 'Некорректный запрос', message: 'Некорректный запрос' },
  },
  internalServerError: {
    en: { error: 'Internal Server Error', message: 'Internal server error' },
    ru: { error: 'Внутренняя ошибка сервера', message: 'Внутренняя ошибка сервера' },
  },
  invalidPreferredLocale: {
    en: { error: 'Bad Request', message: 'preferredLocale must be "en" or "ru"' },
    ru: { error: 'Некорректный запрос', message: 'preferredLocale должен быть "en" или "ru"' },
  },
  invalidSessionToken: {
    en: { error: 'Unauthorized', message: 'Invalid or expired session token' },
    ru: { error: 'Не авторизовано', message: 'Сессия недействительна или истекла' },
  },
  invalidTelegramWebhookSecret: {
    en: { error: 'Unauthorized', message: 'Invalid Telegram webhook secret' },
    ru: { error: 'Не авторизовано', message: 'Неверный секрет Telegram webhook' },
  },
  invalidTelegramInitData: {
    en: { error: 'Unauthorized', message: 'Invalid Telegram initData hash' },
    ru: { error: 'Не авторизовано', message: 'Неверная подпись Telegram initData' },
  },
  missingSessionToken: {
    en: { error: 'Unauthorized', message: 'Missing session token' },
    ru: { error: 'Не авторизовано', message: 'Отсутствует токен сессии' },
  },
  missingTelegramInitData: {
    en: { error: 'Unauthorized', message: 'Missing X-Telegram-Init-Data header' },
    ru: { error: 'Не авторизовано', message: 'Отсутствует заголовок X-Telegram-Init-Data' },
  },
  missingTelegramUser: {
    en: { error: 'Unauthorized', message: 'User data missing in initData' },
    ru: { error: 'Не авторизовано', message: 'В initData отсутствуют данные пользователя' },
  },
  rateLimitExceeded: {
    en: { error: 'Too Many Requests', message: 'Rate limit exceeded' },
    ru: { error: 'Слишком много запросов', message: 'Превышен лимит запросов' },
  },
  telegramInitDataExpired: {
    en: { error: 'Unauthorized', message: 'Telegram initData expired' },
    ru: { error: 'Не авторизовано', message: 'Срок действия Telegram initData истек' },
  },
  userNotFound: {
    en: { error: 'Unauthorized', message: 'User not found' },
    ru: { error: 'Не авторизовано', message: 'Пользователь не найден' },
  },
};

export function resolveRequestLocale(
  request: FastifyRequest,
  preferredLocale?: string | null,
): Locale {
  if (preferredLocale) return normalizeLocale(preferredLocale);

  const header = request.headers['accept-language'];
  return normalizeLocale(Array.isArray(header) ? header[0] : header);
}

export function apiErrorPayload(key: ApiErrorKey, locale: Locale = DEFAULT_LOCALE) {
  return ERROR_TEXT[key][locale] ?? ERROR_TEXT[key][DEFAULT_LOCALE];
}

export function sendLocalizedError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  key: ApiErrorKey,
  preferredLocale?: string | null,
) {
  const locale = resolveRequestLocale(request, preferredLocale);
  return reply.status(statusCode).send(apiErrorPayload(key, locale));
}
