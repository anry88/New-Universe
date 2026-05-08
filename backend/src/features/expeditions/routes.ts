import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../lib/env.js';
import { launchExpedition } from './launch.js';
import { jumpShip } from './jump.js';

export async function expeditionsRoutes(app: FastifyInstance) {
  app.post('/jump', async (request, reply) => {
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

    const {
      shipId,
      targetSector,
    } = request.body as {
      shipId?: string;
      targetSector?: { x: number; y: number; z: number };
    };

    if (!shipId || !targetSector) {
      return reply.status(400).send({
        error: 'shipId and targetSector {x, y, z} are required',
      });
    }

    const result = await jumpShip(payload.userId, {
      shipId,
      targetSector,
    });

    if (!result.success) {
      return reply.status(result.status).send({ error: result.error });
    }

    return reply.send({
      targetSystem: result.targetSystem,
      targetPlanet: result.targetPlanet,
    });
  });

  app.post('/', async (request, reply) => {
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

    const {
      shipId,
      targetX,
      targetY,
      targetZ,
      fuelLoaded,
      cargoLoaded,
    } = request.body as {
      shipId?: string;
      targetX?: number;
      targetY?: number;
      targetZ?: number;
      fuelLoaded?: number;
      cargoLoaded?: number;
    };

    if (
      !shipId ||
      targetX === undefined ||
      targetY === undefined ||
      targetZ === undefined ||
      fuelLoaded === undefined ||
      cargoLoaded === undefined
    ) {
      return reply.status(400).send({
        error: 'shipId, targetX, targetY, targetZ, fuelLoaded, and cargoLoaded are required',
      });
    }

    const result = await launchExpedition(payload.userId, {
      shipId,
      targetX,
      targetY,
      targetZ,
      fuelLoaded,
      cargoLoaded,
    });

    if (!result.success) {
      return reply.status(result.status).send({ error: result.error });
    }

    return reply.send({
      expedition: result.expedition,
      ship: result.ship,
      queueItem: result.queueItem,
    });
  });
}
