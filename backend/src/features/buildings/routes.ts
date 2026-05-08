import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../lib/env.js';
import { buildingService } from './service.js';
import { BuildRequest, UpgradeRequest } from '@shared/types/buildings.js';

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
    } catch (_err) {
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
}
