import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../lib/env.js';
import { foundColony } from '../features/colonies/found-colony.js';

/**
 * Colonies routes.
 * Registered in index.ts with prefix /colonies.
 */
export async function coloniesRoutes(app: FastifyInstance) {
  // Auth hook to verify JWT and attach userId to request
  app.addHook('preHandler', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing session token',
      });
    }

    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
      (request as any).userId = payload.userId;
    } catch {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired session token',
      });
    }
  });

  /**
   * POST /colonies/found
   * Found a new colony on a discovered planet using a colonizer ship.
   */
  app.post('/found', async (request, reply) => {
    const userId = (request as any).userId;
    const { shipId, planetId } = request.body as { shipId: string; planetId: string };

    if (!shipId || !planetId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'shipId and planetId are required',
      });
    }

    try {
      const colony = await foundColony(userId, shipId, planetId);
      return reply.send({ success: true, colony });
    } catch (err: any) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: err.message,
      });
    }
  });
}
