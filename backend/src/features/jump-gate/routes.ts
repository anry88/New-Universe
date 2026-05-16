import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  JumpGateKnownDestinationJumpRequest,
  JumpGateRandomJumpRequest,
} from '@shared/types/jump-gate.js';
import jwt from 'jsonwebtoken';
import { env } from '../../lib/env.js';
import { sendLocalizedError } from '../../lib/i18n.js';
import { trackBackendEvent } from '../../lib/analytics.js';
import { jumpShip } from '../expeditions/jump.js';
import { getJumpGateState } from './service.js';
import { mutationRateLimit } from '../../lib/rate-limit.js';
import {
  nonEmptyStringSchema,
  objectBodySchema,
  securityRouteConfig,
  systemIdParamsSchema,
} from '../../lib/security.js';

async function requireUserId(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  const authHeader = request.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    await sendLocalizedError(reply, request, 401, 'missingSessionToken');
    return null;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    return payload.userId;
  } catch {
    await sendLocalizedError(reply, request, 401, 'invalidSessionToken');
    return null;
  }
}

export async function jumpGateRoutes(app: FastifyInstance) {
  app.get('/state', async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    return reply.send(await getJumpGateState(userId));
  });

  app.post('/random-jump', {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: {
      body: objectBodySchema({ shipId: nonEmptyStringSchema }, ['shipId']),
    },
  }, async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    const body = (request.body ?? {}) as Partial<JumpGateRandomJumpRequest>;
    if (!body.shipId) {
      return sendLocalizedError(reply, request, 400, 'badRequest');
    }

    const result = await jumpShip(userId, {
      shipId: body.shipId,
      mode: 'random',
    });

    if (!result.success) {
      return reply.status(result.status).send({ error: result.error });
    }

    trackBackendEvent('expedition_jump_requested', {
      mode: 'random',
      jumpFuelRequired: result.jumpFuelRequired ?? null,
    }, { userId, requestId: request.id });
    return reply.send({
      ship: result.ship,
      targetSystem: result.targetSystem,
      arrivalPlanetId: result.arrivalPlanetId,
      destination: result.destination,
      jumpFuelRequired: result.jumpFuelRequired,
    });
  });

  app.post('/destinations/:systemId/jump', {
    config: securityRouteConfig(mutationRateLimit, 'body-and-params'),
    schema: {
      params: systemIdParamsSchema,
      body: objectBodySchema({ shipId: nonEmptyStringSchema }, ['shipId']),
    },
  }, async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    const params = request.params as { systemId?: string };
    const body = (request.body ?? {}) as Partial<JumpGateKnownDestinationJumpRequest>;
    if (!params.systemId || !body.shipId) {
      return sendLocalizedError(reply, request, 400, 'badRequest');
    }

    const result = await jumpShip(userId, {
      shipId: body.shipId,
      destinationSystemId: params.systemId,
    });

    if (!result.success) {
      return reply.status(result.status).send({ error: result.error });
    }

    trackBackendEvent('expedition_jump_requested', {
      mode: 'known_destination',
      jumpFuelRequired: result.jumpFuelRequired ?? null,
    }, { userId, requestId: request.id });
    return reply.send({
      ship: result.ship,
      targetSystem: result.targetSystem,
      arrivalPlanetId: result.arrivalPlanetId,
      destination: result.destination,
      jumpFuelRequired: result.jumpFuelRequired,
    });
  });
}
