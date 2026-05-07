import { FastifyInstance } from 'fastify';

export async function botRoutes(fastify: FastifyInstance) {
  fastify.post('/webhook/telegram', async (request, reply) => {
    fastify.log.info({ body: request.body }, 'Received Telegram update');
    return reply.status(200).send({ ok: true });
  });
}
