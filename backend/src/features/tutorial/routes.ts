import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../lib/env.js';
import { syncTutorialProgress } from './service.js';

function readToken(authorization?: string): string | null {
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
}

export async function tutorialRoutes(app: FastifyInstance) {
  app.post('/sync', async (request, reply) => {
    const token = readToken(request.headers.authorization);
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Missing session token' });
    }

    let payload: { userId: string };
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or expired session token' });
    }

    const progress = await syncTutorialProgress(payload.userId);
    return reply.send({
      tutorialStep: progress.tutorialStep,
      tutorialCompletedAt: progress.tutorialCompletedAt,
    });
  });
}
