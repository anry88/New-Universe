import { FastifyInstance } from 'fastify';
import { botService } from '../features/bot/service.js';
import { TelegramUpdate } from '../lib/telegram.js';

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
  fastify.post('/webhook/telegram', async (request, reply) => {
    const update = request.body as TelegramUpdate;
    const logContext = telegramUpdateLogContext(update);
    fastify.log.info(logContext, 'Received Telegram update');
    
    botService.processUpdate(update).catch((err) => {
      fastify.log.error({ err, ...logContext }, 'Error processing Telegram update');
    });

    return reply.status(200).send({ ok: true });
  });
}
