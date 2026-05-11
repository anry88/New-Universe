import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../lib/env.js';
import { buildShip, getShipQueue, rushShipBuild, syncReadyShips } from './build.js';
import { db } from '../../db/index.js';
import { RushShipBuildRequest } from '@shared/types/ships.js';

export async function shipsRoutes(app: FastifyInstance) {
  const resolveUserId = (request: any, reply: any): { ok: true; userId: string } | { ok: false } => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing session token',
      });
      return { ok: false };
    }

    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
      return { ok: true, userId: payload.userId };
    } catch {
      reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired session token',
      });
      return { ok: false };
    }
  };

  app.get('/types', async () => {
    return db.query.shipTypes.findMany();
  });

  app.post('/build', async (request, reply) => {
    const auth = resolveUserId(request, reply);
    if (!auth.ok) return;

    const { planetId, typeSlug } = request.body as {
      planetId?: string;
      typeSlug?: string;
    };

    if (!planetId || !typeSlug) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'planetId and typeSlug are required',
      });
    }

    const result = await buildShip(auth.userId, { planetId, typeSlug });

    if (!result.success) {
      return reply.status(result.status).send({ error: result.error });
    }

    return reply.send({ ship: result.ship });
  });

  app.get('/queue', async (request, reply) => {
    const auth = resolveUserId(request, reply);
    if (!auth.ok) return;
    await syncReadyShips(auth.userId, { skipNotifications: true });
    const queue = await getShipQueue(auth.userId);
    return reply.send(queue);
  });

  app.post('/rush', async (request, reply) => {
    const auth = resolveUserId(request, reply);
    if (!auth.ok) return;
    const { shipId } = request.body as RushShipBuildRequest;
    if (!shipId) {
      return reply.status(400).send({ error: 'shipId is required' });
    }
    try {
      const result = await rushShipBuild(auth.userId, shipId);
      return reply.send(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Bad Request';
      return reply.status(400).send({ error: message });
    }
  });
}
