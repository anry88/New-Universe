import { FastifyInstance } from 'fastify';
import { botService } from '../features/bot/service.js';
import { TelegramUpdate } from '../lib/telegram.js';
import { env } from '../lib/env.js';
import { webhookRateLimit } from '../lib/rate-limit.js';
import { sendLocalizedError } from '../lib/i18n.js';
import {
  securityRouteConfig,
  verifyTelegramWebhookSecret,
} from '../lib/security.js';

function telegramUpdateLogContext(update: TelegramUpdate) {
  const message = update.message;
  const rawCommand = message?.text?.trim().split(/\s+/)[0];
  const command = rawCommand?.startsWith('/') ? rawCommand.split('@')[0].toLowerCase() : undefined;

  return {
    updateId: update.update_id,
    messageId: message?.message_id,
    chatId: message?.chat.id,
    chatType: message?.chat.type,
    fromId: message?.from?.id,
    command,
  };
}

export async function botRoutes(fastify: FastifyInstance) {
  fastify.post('/webhook/telegram', {
    config: securityRouteConfig(webhookRateLimit, 'telegram-webhook'),
    schema: {
      body: {
        type: 'object',
        required: ['update_id'],
        properties: {
          update_id: { type: 'integer', minimum: 1 },
          message: { type: 'object' },
          callback_query: { type: 'object' },
        },
        additionalProperties: true,
      },
    },
  }, async (request, reply) => {
    const secretIsValid = verifyTelegramWebhookSecret(
      request.headers['x-telegram-bot-api-secret-token'],
      env.TELEGRAM_BOT_SECRET,
      env.NODE_ENV === 'production',
    );

    if (!secretIsValid) {
      fastify.log.warn({ hasWebhookSecret: Boolean(request.headers['x-telegram-bot-api-secret-token']) }, 'Rejected Telegram webhook with invalid secret');
      return sendLocalizedError(reply, request, 401, 'invalidTelegramWebhookSecret');
    }

    const update = request.body as TelegramUpdate;
    const logContext = telegramUpdateLogContext(update);
    fastify.log.info(logContext, 'Received Telegram update');
    
    botService.processUpdate(update).catch((err) => {
      fastify.log.error({ err, ...logContext }, 'Error processing Telegram update');
    });

    return reply.status(200).send({ ok: true });
  });
}
