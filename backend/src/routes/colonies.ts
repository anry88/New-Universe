import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../lib/env.js';
import { foundColony } from '../features/colonies/found-colony.js';
import { checkColonizationGates } from '../features/colonies/colonization-rules.js';
import { COLONIZATION_RULES } from '../config/colonization-rules.js';
import { renamePlanet, RenameError } from '../features/world/rename.js';
import { trackBackendEvent } from '../lib/analytics.js';
import { mutationRateLimit } from '../lib/rate-limit.js';
import { nonEmptyStringSchema, objectBodySchema, securityRouteConfig } from '../lib/security.js';

const ENTITY_NAME_PAYLOAD_MAX_LENGTH = 256;

/**
 * Colonies routes.
 * Registered in index.ts with prefix /colonies.
 */
export async function coloniesRoutes(app: FastifyInstance) {
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
   * POST /colonies/found
   * Found a new colony on a discovered planet using a colonizer ship.
   */
  app.post('/found', {
    config: securityRouteConfig(mutationRateLimit, 'body'),
    schema: {
      body: objectBodySchema(
        {
          shipId: nonEmptyStringSchema,
          planetId: nonEmptyStringSchema,
        },
        ['shipId', 'planetId'],
      ),
    },
  }, async (request, reply) => {
    const userId = (request as any).userId;
    const { shipId, planetId } = request.body as { shipId: string; planetId: string };

    if (!shipId || !planetId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'shipId and planetId are required',
      });
    }

    try {
      const colony = await foundColony(userId, shipId, planetId);
      return reply.send({ success: true, colony });
    } catch (err: any) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: err.message,
      });
    }
  });

  /**
   * POST /colonies/:planetId/rename
   * Renames a colonized planet. First rename is free, subsequent renames
   * cost diamonds. Rejects with a typed error on validation failure or
   * domain-level block (not own colony, insufficient diamonds, etc.).
   */
  app.post('/:planetId/rename', {
    config: securityRouteConfig(mutationRateLimit, 'body-and-params'),
    schema: {
      params: objectBodySchema({ planetId: nonEmptyStringSchema }, ['planetId']),
      body: objectBodySchema(
        {
          name: { type: 'string', maxLength: ENTITY_NAME_PAYLOAD_MAX_LENGTH },
        },
        ['name'],
      ),
    },
  }, async (request, reply) => {
    const userId = (request as any).userId;
    const { planetId } = request.params as { planetId: string };
    const { name } = request.body as { name: string };

    try {
      const result = await renamePlanet(userId, planetId, name);
      trackBackendEvent('planet_renamed', {
        renameCount: result.renameCount,
        diamondsSpent: result.diamondsSpent,
        diamondsRemaining: result.diamondsRemaining,
      }, { userId });
      return reply.send(result);
    } catch (err) {
      if (err instanceof RenameError) {
        const status = err.code === 'not_found' ? 404 : err.code === 'not_owned' ? 403 : 400;
        return reply.status(status).send({
          status: 'error',
          code: err.code,
          message: err.message,
        });
      }
      throw err;
    }
  });

  /**
   * GET /colonies/eligibility/:planetId
   * Check if the user satisfies all colonization requirements for a target planet.
   */
  app.get('/eligibility/:planetId', async (request, reply) => {
    const userId = (request as any).userId;
    const { planetId } = request.params as { planetId: string };
    const { routeMode } = request.query as { routeMode?: string };

    try {
      const eligibility = await checkColonizationGates(userId, planetId, {
        enforceDistance: routeMode !== 'jump_gate',
      });
      return reply.send({ 
        eligibility,
        rules: COLONIZATION_RULES
      });
    } catch (err: any) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: err.message,
      });
    }
  });
}
