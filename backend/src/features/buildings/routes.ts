import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../lib/env.js';
import { buildingService } from './service.js';
import { BuildRequest, UpgradeRequest } from '@shared/types/buildings.js';
import { db } from '../../db/index.js';
import { buildings, planets, systems } from '../../db/schema.js';
import { and, eq, isNotNull } from 'drizzle-orm';

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
    const { planetId, typeId, slotIndex } = request.body as BuildRequest;
    const userId = (request as any).userId;

    try {
      const result = await buildingService.build(userId, planetId, typeId, slotIndex);
      return result;
    } catch (err: any) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: err.message,
      });
    }
  });

  app.post('/upgrade', async (request, reply) => {
    const { buildingId } = request.body as UpgradeRequest;
    const userId = (request as any).userId;

    try {
      const result = await buildingService.upgrade(userId, buildingId);
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

    const rows = await db
      .select({
        id: buildings.id,
        planetId: buildings.planetId,
        buildingTypeId: buildings.typeId,
        level: buildings.level,
        queueAction: buildings.queueAction,
        queueCompletesAt: buildings.queueCompletesAt,
      })
      .from(buildings)
      .innerJoin(planets, eq(planets.id, buildings.planetId))
      .innerJoin(systems, eq(systems.id, planets.systemId))
      .where(
        and(
          eq(systems.ownerId, userId),
          isNotNull(buildings.queueAction),
          isNotNull(buildings.queueCompletesAt),
        ),
      );

    return {
      queue: rows
        .map((row) => ({
          ...row,
          queueAction: row.queueAction as 'build' | 'upgrade' | 'destroy',
          queueCompletesAt: row.queueCompletesAt!.toISOString(),
        }))
        .sort(
          (a, b) =>
            new Date(a.queueCompletesAt).getTime() - new Date(b.queueCompletesAt).getTime(),
        ),
    };
  });
}
