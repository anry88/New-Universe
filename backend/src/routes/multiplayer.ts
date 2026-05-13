import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../lib/env.js';
import { getSectorPresence, getSectorSystemAnchors } from '../features/multiplayer/presence.js';

function parseSectorCoord(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Multiplayer sector map API — presence markers per sector cube.
 */
export async function multiplayerRoutes(app: FastifyInstance) {
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
      (request as { userId?: string }).userId = payload.userId;
    } catch {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired session token',
      });
    }
  });

  app.get('/systems', async (request, reply) => {
    const userId = (request as { userId?: string }).userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Missing user' });
    }

    const payload = await getSectorSystemAnchors(userId);
    return reply.send(payload);
  });

  app.get('/sectors/:sx/:sy/:sz/presence', async (request, reply) => {
    const userId = (request as { userId?: string }).userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Missing user' });
    }

    const params = request.params as { sx: string; sy: string; sz: string };
    const sx = parseSectorCoord(params.sx);
    const sy = parseSectorCoord(params.sy);
    const sz = parseSectorCoord(params.sz);

    if (sx === null || sy === null || sz === null) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Sector coordinates must be integers',
      });
    }

    const payload = await getSectorPresence(userId, sx, sy, sz);
    return reply.send(payload);
  });
}
