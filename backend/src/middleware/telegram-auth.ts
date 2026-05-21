import { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../lib/env.js';
import { isInitDataExpired, validateTelegramInitData } from '../lib/telegram.js';
import { sendLocalizedError } from '../lib/i18n.js';
import { normalizeLocale } from '@shared/types/locale.js';

export async function telegramAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const initData = request.headers['x-telegram-init-data'];

  if (!initData || typeof initData !== 'string') {
    return sendLocalizedError(reply, request, 401, 'missingTelegramInitData');
  }

  const validatedData = validateTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN);

  if (!validatedData) {
    return sendLocalizedError(reply, request, 401, 'invalidTelegramInitData');
  }

  if (isInitDataExpired(validatedData.auth_date)) {
    return sendLocalizedError(
      reply,
      request,
      401,
      'telegramInitDataExpired',
      normalizeLocale(validatedData.user?.language_code),
    );
  }

  if (!validatedData.user) {
    return sendLocalizedError(reply, request, 401, 'missingTelegramUser');
  }

  request.user = validatedData.user;
  request.telegramInitData = validatedData;
}
