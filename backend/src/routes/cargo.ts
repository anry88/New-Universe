import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../lib/env.js';
import { launchCargoTransfer, previewCargoTransfer } from '../features/logistics/cargo-transfer.js';
import type { CargoTransferRequest, CargoTransferRouteMode } from '@shared/types/cargo.js';
import { mutationRateLimit } from '../lib/rate-limit.js';
import { trackBackendEvent } from '../lib/analytics.js';
import {
  nonEmptyStringSchema,
  objectBodySchema,
  positiveNumberSchema,
  securityRouteConfig,
} from '../lib/security.js';

const cargoTransferBodySchema = objectBodySchema(
  {
    shipId: nonEmptyStringSchema,
    targetPlanetId: nonEmptyStringSchema,
    routeMode: { type: 'string', enum: ['standard', 'jump_gate'] },
    resources: {
      type: 'array',
      minItems: 1,
      maxItems: 32,
      items: objectBodySchema(
        {
          resourceId: nonEmptyStringSchema,
          amount: positiveNumberSchema,
        },
        ['resourceId', 'amount'],
      ),
    },
  },
  ['shipId', 'targetPlanetId', 'resources'],
);

function readCargoTransferBody(body: unknown): Partial<CargoTransferRequest> {
  const {
    shipId,
    targetPlanetId,
    routeMode,
    resources,
  } = (body ?? {}) as Partial<CargoTransferRequest>;

  return {
    shipId,
    targetPlanetId,
    routeMode: routeMode as CargoTransferRouteMode | undefined,
    resources,
  };
}

/**
 * Cargo transfer routes.
 * Registered in index.ts with prefix /cargo.
 */
export async function cargoRoutes(app: FastifyInstance) {
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
   * POST /cargo/transfer/preview
   * Server-side cargo route preview for ETA, fuel, and Jump Fuel costs.
   */
  app.post('/transfer/preview', {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: {
      body: cargoTransferBodySchema,
    },
  }, async (request, reply) => {
    const userId = (request as any).userId;
    const { shipId, targetPlanetId, routeMode, resources } = readCargoTransferBody(request.body);

    if (!shipId || !targetPlanetId || !resources || !Array.isArray(resources)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'shipId, targetPlanetId and resources array are required',
      });
    }

    try {
      const result = await previewCargoTransfer(userId, {
        shipId,
        targetPlanetId,
        routeMode,
        resources,
      });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: err.message,
      });
    }
  });

  /**
   * POST /cargo/transfer
   * Launch a cargo transfer between two player-owned planets.
   */
  app.post('/transfer', {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: {
      body: cargoTransferBodySchema,
    },
  }, async (request, reply) => {
    const userId = (request as any).userId;
    const { shipId, targetPlanetId, routeMode, resources } = readCargoTransferBody(request.body);

    if (!shipId || !targetPlanetId || !resources || !Array.isArray(resources)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'shipId, targetPlanetId and resources array are required',
      });
    }

    try {
      const result = await launchCargoTransfer(userId, {
        shipId,
        targetPlanetId,
        routeMode,
        resources,
      });
      trackBackendEvent('cargo_transfer_started', {
        routeMode: routeMode ?? 'standard',
        resourceLineCount: resources.length,
      }, { userId, requestId: request.id });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: err.message,
      });
    }
  });
}
