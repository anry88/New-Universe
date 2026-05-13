import { FastifyInstance, type FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../lib/env.js';
import { convertResources, buyResourceWithDiamonds, quoteResourceWithDiamonds } from './convert.js';
import { computeCurrentResources } from './accrual.js';
import { productionService, ProductionOperationError } from './production.js';
import type { ProductionPreviewRequest, ProductionStartRequest } from '@shared/types/production.js';
import { mutationRateLimit } from '../../lib/rate-limit.js';
import {
  nonEmptyStringSchema,
  objectBodySchema,
  paramsSchema,
  positiveNumberSchema,
  securityRouteConfig,
} from '../../lib/security.js';

function readUserIdFromRequest(request: FastifyRequest): { userId?: string; error?: { status: number; body: Record<string, string> } } {
  const authHeader = request.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return {
      error: {
        status: 401,
        body: { error: 'Unauthorized', message: 'Missing session token' },
      },
    };
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    return { userId: payload.userId };
  } catch {
    return {
      error: {
        status: 401,
        body: { error: 'Unauthorized', message: 'Invalid or expired session token' },
      },
    };
  }
}

export async function resourcesRoutes(app: FastifyInstance) {
  app.get('/production/recipes', async (request, reply) => {
    const auth = readUserIdFromRequest(request);
    if (auth.error) return reply.status(auth.error.status).send(auth.error.body);

    const { planetId, buildingId } = request.query as { planetId?: string; buildingId?: string };
    if (planetId && buildingId) {
      const recipes = await productionService.recipesForBuilding(auth.userId!, buildingId, planetId);
      return reply.send({ recipes });
    }

    return reply.send({ recipes: productionService.listRecipes() });
  });

  const productionBodySchema = objectBodySchema(
    {
      planetId: nonEmptyStringSchema,
      buildingId: nonEmptyStringSchema,
      recipeId: nonEmptyStringSchema,
      quantity: positiveNumberSchema,
    },
    ['planetId', 'buildingId', 'recipeId', 'quantity'],
  );
  const resourceAmountPurchaseSchema = objectBodySchema(
    {
      planetId: nonEmptyStringSchema,
      resourceId: nonEmptyStringSchema,
      amount: positiveNumberSchema,
    },
    ['planetId', 'resourceId', 'amount'],
  );

  app.post('/production/preview', {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: { body: productionBodySchema },
  }, async (request, reply) => {
    const auth = readUserIdFromRequest(request);
    if (auth.error) return reply.status(auth.error.status).send(auth.error.body);

    const body = request.body as Partial<ProductionPreviewRequest> | null;
    if (!body?.planetId || !body.buildingId || !body.recipeId || body.quantity == null) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'planetId, buildingId, recipeId, and quantity are required',
      });
    }

    return reply.send(await productionService.preview(auth.userId!, {
      planetId: body.planetId,
      buildingId: body.buildingId,
      recipeId: body.recipeId,
      quantity: body.quantity,
    }));
  });

  app.post('/production/start', {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: { body: productionBodySchema },
  }, async (request, reply) => {
    const auth = readUserIdFromRequest(request);
    if (auth.error) return reply.status(auth.error.status).send(auth.error.body);

    const body = request.body as Partial<ProductionStartRequest> | null;
    if (!body?.planetId || !body.buildingId || !body.recipeId || body.quantity == null) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'planetId, buildingId, recipeId, and quantity are required',
      });
    }

    try {
      const order = await productionService.start(auth.userId!, {
        planetId: body.planetId,
        buildingId: body.buildingId,
        recipeId: body.recipeId,
        quantity: body.quantity,
      });
      return reply.send({ success: true, order });
    } catch (err: unknown) {
      if (err instanceof ProductionOperationError) {
        return reply.status(err.status).send({
          error: 'Bad Request',
          message: err.message,
          code: err.code,
          details: err.details,
        });
      }
      const e = err as { message?: string };
      return reply.status(400).send({ error: 'Bad Request', message: e.message ?? 'Bad Request' });
    }
  });

  app.get('/production/orders', async (request, reply) => {
    const auth = readUserIdFromRequest(request);
    if (auth.error) return reply.status(auth.error.status).send(auth.error.body);
    const { planetId } = request.query as { planetId?: string };
    await productionService.processDueOrders({ userId: auth.userId!, planetId });
    return reply.send({ orders: await productionService.listOrders(auth.userId!, planetId) });
  });

  app.post('/production/sync/:planetId', {
    config: securityRouteConfig(mutationRateLimit, 'params'),
    schema: {
      params: paramsSchema({ planetId: nonEmptyStringSchema }, ['planetId']),
    },
  }, async (request, reply) => {
    const auth = readUserIdFromRequest(request);
    if (auth.error) return reply.status(auth.error.status).send(auth.error.body);
    const { planetId } = request.params as { planetId: string };
    await productionService.processDueOrders({ userId: auth.userId!, planetId });
    return reply.send({ success: true });
  });

  app.post('/convert', {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: {
      body: objectBodySchema(
        {
          planetId: nonEmptyStringSchema,
          from: nonEmptyStringSchema,
          to: nonEmptyStringSchema,
          amount: positiveNumberSchema,
        },
        ['planetId', 'from', 'to', 'amount'],
      ),
    },
  }, async (request, reply) => {
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

  app.post('/buy-with-diamonds', {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: { body: resourceAmountPurchaseSchema },
  }, async (request, reply) => {
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

  app.post('/buy-with-diamonds/quote', {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: { body: resourceAmountPurchaseSchema },
  }, async (request, reply) => {
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
