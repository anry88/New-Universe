import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../lib/env.js';
import { db } from '../../db/index.js';
import { users, systems, planets, planetResources, resources, buildings } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { User } from '@shared/types/user.js';

export async function meRoutes(app: FastifyInstance) {
  app.get(
    '/',
    async (request, reply) => {
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
        
        const user = await db.query.users.findFirst({
          where: eq(users.id, payload.userId),
        });

        if (!user) {
          return reply.status(401).send({
            error: 'Unauthorized',
            message: 'User not found',
          });
        }

        const userObj = {
          ...user,
          tgId: user.tgId.toString()
        };

        const homeSystem = await db.query.systems.findFirst({
          where: and(
            eq(systems.ownerId, user.id),
            eq(systems.isHome, true)
          ),
        });

        if (!homeSystem) {
          return {
            user: userObj,
            homeSystem: undefined,
          };
        }

        const planetsData: any[] = await db.query.planets.findMany({
          where: eq(planets.systemId, homeSystem.id),
          with: {
            resources: {
              with: {
                resource: true,
              },
            },
            buildings: true,
          },
        });

        const homeSystemData = {
          ...homeSystem,
          planets: planetsData.map((planet: any) => ({
            ...planet,
            resources: planet.resources?.map((pr: any) => ({
              planetId: pr.planetId,
              resourceId: pr.resourceId,
              amount: pr.amount.toString(),
              lastUpdateAt: pr.lastUpdateAt.toISOString(),
              regenRate: pr.regenRate.toString(),
            })) || [],
            buildings: planet.buildings?.map((b: any) => ({
              id: b.id,
              planetId: b.planetId,
              typeId: b.typeId,
              level: b.level,
              queueAction: b.queueAction || undefined,
              queueCompletesAt: b.queueCompletesAt?.toISOString() || undefined,
            })) || [],
          })),
        };

        return {
          user: userObj,
          homeSystem: homeSystemData,
        };
      } catch (_err) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid or expired session token',
        });
      }
    }
  );
}
