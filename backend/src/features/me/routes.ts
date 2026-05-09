import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../lib/env.js';
import { db } from '../../db/index.js';
import { users, systems, discoveredPlanets, planets, ships, expeditions, researchProgress } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { syncTutorialProgress } from '../tutorial/service.js';

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

      let payload: { userId: string };
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    } catch {
      return reply.status(401).send({

          error: 'Unauthorized',
          message: 'Invalid or expired session token',
        });
      }

      try {
        const user = await db.query.users.findFirst({
          where: eq(users.id, payload.userId),
        });

        if (!user) {
          return reply.status(401).send({
            error: 'Unauthorized',
            message: 'User not found',
          });
        }

        let homeSystem = await db.query.systems.findFirst({
          where: eq(systems.ownerId, user.id),
          with: {
            planets: {
              with: {
                buildings: true,
              },
            },
          },
        });

        if (!homeSystem) {
          const discoveredPlanet = await db.query.discoveredPlanets.findFirst({
            where: eq(discoveredPlanets.userId, user.id),
          });

          if (discoveredPlanet) {
            const discoveredSystem = await db.query.planets.findFirst({
              where: eq(planets.id, discoveredPlanet.planetId),
              with: {
                system: {
                  with: {
                    planets: {
                      with: {
                        buildings: true,
                      },
                    },
                  },
                },
              },
            });
            homeSystem = discoveredSystem?.system;
          }
        }

        const userShips = await db.query.ships.findMany({
          where: eq(ships.ownerId, user.id),
        });

        const activeExpeditions = await db.query.expeditions.findMany({
          where: eq(expeditions.status, 'active'),
        });

        const userResearch = await db.query.researchProgress.findMany({
          where: eq(researchProgress.userId, user.id),
        });

        const tutorialProgress = await syncTutorialProgress(user.id);

        const { computeCurrentResources } = await import('../resources/accrual.js');

        if (homeSystem && homeSystem.planets) {
          homeSystem.planets = await Promise.all(
            homeSystem.planets.map(async (planet: any) => {
              const res = await computeCurrentResources(planet.id);
              return {
                ...planet,
                resources: res.map(r => ({
                  ...r,
                  amount: r.amount.toString(),
                  regenRate: r.regenRate.toString(),
                  storageCap: r.storageCap.toString(),
                  lastUpdateAt: r.lastUpdateAt.toISOString(),
                })),
              };
            })
          );
        }

        const userObj = {
          ...user,
          tgId: user.tgId.toString(),
          tutorialStep: tutorialProgress.tutorialStepCompleted,
          tutorialCompletedAt: tutorialProgress.tutorialCompletedAt,
          homeSystem,
          ships: userShips,
          expeditions: activeExpeditions,
          research: userResearch,
        };

        return reply.send({ user: userObj });
      } catch (err) {
        request.log.error(err, 'Error fetching player state');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch player state',
        });
      }
    }
  );
}
