import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../lib/env.js';
import { buildShip, getShipQueue, rushShipBuild, syncReadyShips } from './build.js';
import { refuelShip } from './refuel.js';
import { db } from '../../db/index.js';
import { formatShipBuildErrorMessage, RushShipBuildRequest, type ShipBuildErrorDetails } from '@shared/types/ships.js';
import { type RefuelRequest, type RefuelErrorDetails, formatRefuelErrorMessage } from '@shared/types/refuel.js';
import { resolveRequestLocale } from '../../lib/i18n.js';
import { mutationRateLimit } from '../../lib/rate-limit.js';
import { nonEmptyStringSchema, objectBodySchema, securityRouteConfig } from '../../lib/security.js';

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

  app.post('/build', {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: {
      body: objectBodySchema(
        {
          planetId: nonEmptyStringSchema,
          typeSlug: nonEmptyStringSchema,
        },
        ['planetId', 'typeSlug'],
      ),
    },
  }, async (request, reply) => {
    const auth = resolveUserId(request, reply);
    if (!auth.ok) return;

    const { planetId, typeSlug } = request.body as {
      planetId?: string;
      typeSlug?: string;
    };

    if (!planetId || !typeSlug) {
      const locale = resolveRequestLocale(request);
      return reply.status(400).send({
        error: 'Bad Request',
        message: locale === 'ru' ? 'Выберите планету и тип корабля.' : 'Select a planet and ship type.',
      });
    }

    const result = await buildShip(auth.userId, { planetId, typeSlug });

    if (!result.success) {
      const locale = resolveRequestLocale(request);
      const details = result.code
        ? ({ code: result.code, ...(result.details ?? {}) } as ShipBuildErrorDetails)
        : null;
      return reply.status(result.status).send({
        error: details ? formatShipBuildErrorMessage(details, locale) : result.error,
        code: result.code,
        details: result.details,
      });
    }

    return reply.send({ ship: result.ship, queueItem: result.queueItem });
  });

  app.get('/queue', async (request, reply) => {
    const auth = resolveUserId(request, reply);
    if (!auth.ok) return;
    await syncReadyShips(auth.userId, { skipNotifications: true });
    const queue = await getShipQueue(auth.userId);
    return reply.send(queue);
  });

  app.post('/rush', {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: {
      body: objectBodySchema({ shipId: nonEmptyStringSchema }, ['shipId']),
    },
  }, async (request, reply) => {
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

  app.post('/refuel', {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: {
      body: objectBodySchema(
        {
          targetShipId: nonEmptyStringSchema,
          sourceShipId: nonEmptyStringSchema,
          fuel: { type: 'number', minimum: 0 },
          jumpFuel: { type: 'number', minimum: 0 },
        },
        ['targetShipId', 'sourceShipId'],
      ),
    },
  }, async (request, reply) => {
    const auth = resolveUserId(request, reply);
    if (!auth.ok) return;

    const req = request.body as RefuelRequest;
    const result = await refuelShip(auth.userId, req);

    if (!result.success) {
      const locale = resolveRequestLocale(request);
      const details = result.code
        ? ({ code: result.code, ...(result.details ?? {}) } as RefuelErrorDetails)
        : null;
      return reply.status(result.status).send({
        error: details ? formatRefuelErrorMessage(details, locale) : result.error,
        code: result.code,
        details: result.details,
      });
    }

    return reply.send(result.data);
  });
}
