import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../lib/env.js';
import { buildingService } from './service.js';
import { BuildingOperationError } from './building-operation-error.js';
import {
  BuildRequest,
  UpgradeRequest,
  DemolishRequest,
  RushBuildRequest,
} from '@shared/types/buildings.js';
import { rushDiamondCost, rushPricingMeta, rushRemainingSeconds } from '../../lib/diamonds.js';

import { db } from '../../db/index.js';
import { buildings, buildingTypes, colonies, planets, systems } from '../../db/schema.js';
import { and, eq, isNotNull, or } from 'drizzle-orm';
import { getResearchEffectsForUser } from '../research/effects.js';
import { deriveBuildingQueueStartedAt } from '../timers.js';

export async function buildingsRoutes(app: FastifyInstance) {
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

  app.get('/types', async () => {
    return buildingService.getBuildingTypes();
  });

  app.post('/build', async (request, reply) => {
    const { planetId, typeId, slotIndex, selectedResourceId } = request.body as BuildRequest;
    const userId = (request as any).userId;

    try {
      const result = await buildingService.build(userId, planetId, typeId, slotIndex, selectedResourceId);
      return result;
    } catch (err: unknown) {
      if (err instanceof BuildingOperationError) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: err.message,
          code: err.code,
          details: err.details,
        });
      }
      const e = err as { message?: string };
      return reply.status(400).send({
        error: 'Bad Request',
        message: e.message ?? 'Bad Request',
      });
    }
  });

  app.post('/upgrade', async (request, reply) => {
    const { buildingId } = request.body as UpgradeRequest;
    const userId = (request as any).userId;

    try {
      const result = await buildingService.upgrade(userId, buildingId);
      return result;
    } catch (err: unknown) {
      if (err instanceof BuildingOperationError) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: err.message,
          code: err.code,
          details: err.details,
        });
      }
      const e = err as { message?: string };
      return reply.status(400).send({
        error: 'Bad Request',
        message: e.message ?? 'Bad Request',
      });
    }
  });

  app.post('/demolish', async (request, reply) => {
    const { buildingId } = request.body as DemolishRequest;
    const userId = (request as any).userId;

    try {
      const result = await buildingService.demolish(userId, buildingId);
      return result;
    } catch (err: any) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: err.message,
      });
    }
  });

  app.post('/sync/:planetId', async (request, reply) => {
    const { planetId } = request.params as { planetId: string };
    const userId = (request as any).userId;

    try {
      await buildingService.syncPlanetBuildings(userId, planetId);
      return { success: true };
    } catch (err: any) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: err.message,
      });
    }
  });

  app.get('/queue', async (request) => {
    const userId = (request as any).userId as string;
    const researchEffects = await getResearchEffectsForUser(userId, db);

    const rows = await db
      .select({
        id: buildings.id,
        planetId: buildings.planetId,
        buildingTypeId: buildings.typeId,
        level: buildings.level,
        queueAction: buildings.queueAction,
        queueCompletesAt: buildings.queueCompletesAt,
        baseTimeSec: buildingTypes.baseTimeSec,
      })
      .from(buildings)
      .innerJoin(buildingTypes, eq(buildingTypes.id, buildings.typeId))
      .innerJoin(planets, eq(planets.id, buildings.planetId))
      .innerJoin(systems, eq(systems.id, planets.systemId))
      .leftJoin(colonies, eq(colonies.planetId, planets.id))
      .where(
        and(
          or(eq(systems.ownerId, userId), eq(colonies.ownerId, userId)),
          isNotNull(buildings.queueAction),
          isNotNull(buildings.queueCompletesAt),
        ),
      );

    const sorted = rows
      .map((row) => ({
        ...row,
        queueAction: row.queueAction as 'build' | 'upgrade' | 'destroy',
        queueCompletesAt: row.queueCompletesAt!.toISOString(),
        queueStartedAt: deriveBuildingQueueStartedAt(
          row,
          { baseTimeSec: row.baseTimeSec },
          researchEffects,
        ),
        rushCost: rushDiamondCost(rushRemainingSeconds(row.queueCompletesAt!)),
      }))
      .sort(
        (a, b) =>
          new Date(a.queueCompletesAt).getTime() - new Date(b.queueCompletesAt).getTime(),
      );

    return {
      queue: sorted,
      rushPricing: rushPricingMeta(),
    };
  });

  app.post('/rush', async (request, reply) => {
    const { buildingId } = request.body as RushBuildRequest;
    const userId = (request as any).userId as string;

    if (!buildingId || typeof buildingId !== 'string') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'buildingId is required',
      });
    }

    try {
      return await buildingService.rushQueuedBuilding(userId, buildingId);
    } catch (err: unknown) {
      if (err instanceof BuildingOperationError) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: err.message,
          code: err.code,
          details: err.details,
        });
      }
      const e = err as { message?: string };
      return reply.status(400).send({
        error: 'Bad Request',
        message: e.message ?? 'Bad Request',
      });
    }
  });
}
