import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../lib/env.js';
import { buildShip } from './build.js';
import { db } from '../../db/index.js';

export async function shipsRoutes(app: FastifyInstance) {
  app.get('/types', async () => {
    return db.query.shipTypes.findMany();
  });

  app.post('/build', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing session token',
      });
    }

    let payload: { userId: string };
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    } catch {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired session token',
      });
    }

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

    const result = await buildShip(payload.userId, { planetId, typeSlug });

    if (!result.success) {
      return reply.status(result.status).send({ error: result.error });
    }

    return reply.send({ ship: result.ship });
  });
}
