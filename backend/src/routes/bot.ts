import { FastifyInstance } from 'fastify';
import { botService } from '../features/bot/service.js';
import { TelegramUpdate } from '../lib/telegram.js';

export async function botRoutes(fastify: FastifyInstance) {
  fastify.post('/webhook/telegram', async (request, reply) => {
    const update = request.body as TelegramUpdate;
    fastify.log.info({ updateId: update.update_id }, 'Received Telegram update');
    
    botService.processUpdate(update).catch((err) => {
      fastify.log.error(err, 'Error processing Telegram update');
    });

    return reply.status(200).send({ ok: true });
  });
}
