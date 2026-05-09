import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../lib/env.js';
import { cancelNpcOrder, createNpcOrder, listNpcMarketOffers } from '../features/market/orders.js';

function getUserIdFromAuthHeader(authHeader: string | undefined): string {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw new Error('Missing session token');
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    return payload.userId;
  } catch {
    throw new Error('Invalid or expired session token');
  }
}

export async function marketRoutes(app: FastifyInstance) {
  app.get('/market/offers', async (_request, reply) => {
    const result = await listNpcMarketOffers();
    return reply.send(result);
  });

  app.post('/market/orders', async (request, reply) => {
    let userId: string;
    try {
      userId = getUserIdFromAuthHeader(request.headers.authorization);
    } catch (error: any) {
      return reply.status(401).send({ error: 'Unauthorized', message: error.message });
    }

    const body = request.body as {
      planetId?: string;
      side?: 'buy' | 'sell';
      resourceId?: string;
      quantity?: number;
      expectedUnitPrice?: number;
    };

    if (!body.planetId || !body.side || !body.resourceId) {
      return reply.status(400).send({ error: 'Bad Request', message: 'planetId, side, resourceId are required' });
    }

    try {
      const result = await createNpcOrder({
        userId,
        planetId: body.planetId,
        side: body.side,
        resourceId: body.resourceId,
        quantity: Number(body.quantity),
        expectedUnitPrice: Number(body.expectedUnitPrice),
      });
      return reply.send(result);
    } catch (error: any) {
      return reply.status(400).send({ error: 'Bad Request', message: error.message });
    }
  });

  app.post('/market/orders/:orderId/cancel', async (request, reply) => {
    let userId: string;
    try {
      userId = getUserIdFromAuthHeader(request.headers.authorization);
    } catch (error: any) {
      return reply.status(401).send({ error: 'Unauthorized', message: error.message });
    }

    const params = request.params as { orderId: string };
    const body = request.body as { planetId?: string };
    if (!params.orderId || !body.planetId) {
      return reply.status(400).send({ error: 'Bad Request', message: 'orderId and planetId are required' });
    }

    try {
      const result = await cancelNpcOrder({
        userId,
        orderId: params.orderId,
        planetId: body.planetId,
      });
      return reply.send(result);
    } catch (error: any) {
      return reply.status(400).send({ error: 'Bad Request', message: error.message });
    }
  });
}
