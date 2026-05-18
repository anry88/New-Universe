import type { FastifyInstance } from 'fastify';
import { env } from '../../lib/env.js';
import { requireSessionUserId, systemIdParamsSchema } from '../../lib/security.js';
import { getSystemTacticalState } from './tactical-state.js';

export async function systemsRoutes(app: FastifyInstance) {
  app.get('/:systemId/tactical-state', {
    schema: {
      params: systemIdParamsSchema,
    },
  }, async (request, reply) => {
    const userId = await requireSessionUserId(request, reply, env.JWT_SECRET);
    if (!userId) return;

    const params = request.params as { systemId?: string };
    if (!params.systemId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Missing system id',
      });
    }

    const state = await getSystemTacticalState(userId, params.systemId);
    if (!state) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'System tactical state not found',
      });
    }

    return reply.send(state);
  });
}
