import { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../lib/env.js';
import { isInitDataExpired, validateTelegramInitData } from '../lib/telegram.js';

export async function telegramAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const initData = request.headers['x-telegram-init-data'];

  if (!initData || typeof initData !== 'string') {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing X-Telegram-Init-Data header',
    });
  }

  const validatedData = validateTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN);

  if (!validatedData) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid Telegram initData hash',
    });
  }

  if (isInitDataExpired(validatedData.auth_date)) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Telegram initData expired',
    });
  }

  if (!validatedData.user) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'User data missing in initData',
    });
  }

  request.user = validatedData.user;
}
