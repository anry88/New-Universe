import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../lib/env.js';
import { convertResources, buyResourceWithDiamonds, quoteResourceWithDiamonds } from './convert.js';
import { computeCurrentResources } from './accrual.js';

export async function resourcesRoutes(app: FastifyInstance) {
  app.post('/convert', async (request, reply) => {
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

    const { planetId, from, to, amount } = request.body as {
      planetId?: string;
      from?: string;
      to?: string;
      amount?: number;
    };

    if (!planetId || !from || !to || amount == null) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'planetId, from, to, and amount are required',
      });
    }

    const result = await convertResources(payload.userId, {
      planetId,
      from: from as 'ice' | 'water',
      to: to as 'ice' | 'water',
      amount,
    });

    if (!result.success) {
      return reply.status(result.status).send({ error: result.error });
    }

    return reply.send(result.data);
  });

  app.post('/buy-with-diamonds', async (request, reply) => {
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

    const { planetId, resourceId, amount } = request.body as {
      planetId?: string;
      resourceId?: string;
      amount?: number;
    };

    if (!planetId || !resourceId || amount == null) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'planetId, resourceId, and amount are required',
      });
    }

    const result = await buyResourceWithDiamonds(payload.userId, {
      planetId,
      resourceId,
      amount,
    });

    if (!result.success) {
      return reply.status(result.status).send({ error: result.error });
    }

    return reply.send(result.data);
  });

  app.post('/buy-with-diamonds/quote', async (request, reply) => {
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

    const { planetId, resourceId, amount } = request.body as {
      planetId?: string;
      resourceId?: string;
      amount?: number;
    };

    if (!planetId || !resourceId || amount == null) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'planetId, resourceId, and amount are required',
      });
    }

    const result = await quoteResourceWithDiamonds(payload.userId, {
      planetId,
      resourceId,
      amount,
    });

    if (!result.success) {
      return reply.status(result.status).send({ error: result.error });
    }

    return reply.send(result.data);
  });

  app.get('/planets/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const resources = await computeCurrentResources(id);
      return reply.send({ resources });
    } catch (err) {
      request.log.error(err, 'Error fetching planet resources');
      return reply.status(500).send({ error: 'Failed to fetch resources' });
    }
  });
}
