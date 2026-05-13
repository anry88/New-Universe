import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../lib/env.js';
import { sendLocalizedError } from '../../lib/i18n.js';
import { getJumpGateState } from './service.js';

async function requireUserId(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  const authHeader = request.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    await sendLocalizedError(reply, request, 401, 'missingSessionToken');
    return null;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    return payload.userId;
  } catch {
    await sendLocalizedError(reply, request, 401, 'invalidSessionToken');
    return null;
  }
}

export async function jumpGateRoutes(app: FastifyInstance) {
  app.get('/state', async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    return reply.send(await getJumpGateState(userId));
  });
}
