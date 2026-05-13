import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../lib/env.js';
import { launchCargoTransfer } from '../features/logistics/cargo-transfer.js';
import type { CargoTransferRequest } from '@shared/types/cargo.js';
import { mutationRateLimit } from '../lib/rate-limit.js';
import {
  nonEmptyStringSchema,
  objectBodySchema,
  positiveNumberSchema,
  securityRouteConfig,
} from '../lib/security.js';

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
   * POST /cargo/transfer
   * Launch a cargo transfer between two player-owned planets.
   */
  app.post('/transfer', {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: {
      body: objectBodySchema(
        {
          shipId: nonEmptyStringSchema,
          targetPlanetId: nonEmptyStringSchema,
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
      ),
    },
  }, async (request, reply) => {
    const userId = (request as any).userId;
    const { shipId, targetPlanetId, resources } = (request.body ?? {}) as Partial<CargoTransferRequest>;

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
}
