import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { env } from '../../lib/env.js';
import { trackBackendEvent } from '../../lib/analytics.js';
import { mutationRateLimit } from '../../lib/rate-limit.js';
import {
  nonEmptyStringSchema,
  objectBodySchema,
  requireSessionUserId,
  securityRouteConfig,
  systemIdParamsSchema,
} from '../../lib/security.js';
import { db } from '../../db/index.js';
import { systems } from '../../db/schema.js';
import { getSystemTacticalState } from './tactical-state.js';
import { renameSystem, RenameError } from '../world/rename.js';

const ENTITY_NAME_PAYLOAD_MAX_LENGTH = 256;

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

  app.post('/:systemId/rename', {
    config: securityRouteConfig(mutationRateLimit, 'body-and-params'),
    schema: {
      params: objectBodySchema({ systemId: nonEmptyStringSchema }, ['systemId']),
      body: objectBodySchema(
        {
          name: { type: 'string', maxLength: ENTITY_NAME_PAYLOAD_MAX_LENGTH },
        },
        ['name'],
      ),
    },
  }, async (request, reply) => {
    const userId = await requireSessionUserId(request, reply, env.JWT_SECRET);
    if (!userId) return;

    const { systemId } = request.params as { systemId: string };
    const { name } = request.body as { name: string };

    try {
      const result = await renameSystem(userId, systemId, name);
      const systemRow = await db.query.systems.findFirst({
        where: eq(systems.id, systemId),
        columns: { isHome: true },
      });
      trackBackendEvent('system_renamed', {
        renameCount: result.renameCount,
        diamondsSpent: result.diamondsSpent,
        diamondsRemaining: result.diamondsRemaining,
        isHome: Boolean(systemRow?.isHome),
      }, { userId });
      return reply.send(result);
    } catch (err) {
      if (err instanceof RenameError) {
        const status =
          err.code === 'not_found'
            ? 404
            : err.code === 'no_player_colony' || err.code === 'foreign_colony_present'
              ? 403
              : 400;
        return reply.status(status).send({
          status: 'error',
          code: err.code,
          message: err.message,
        });
      }
      throw err;
    }
  });
}
