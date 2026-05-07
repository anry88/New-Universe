import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../lib/env.js';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
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

        return { 
          user: {
            ...user,
            tgId: user.tgId.toString()
          }
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
