import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../lib/env.js';
import { db } from '../../db/index.js';
import { users, systems } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

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

        const homeSystem = await db.query.systems.findFirst({
          where: eq(systems.ownerId, user.id),
          with: {
            planets: {
              with: {
                buildings: true,
              },
            },
          },
        });

        const userObj = {
          ...user,
          tgId: user.tgId.toString(),
          homeSystem,
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
