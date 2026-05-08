import './lib/sentry.js';
import Fastify from 'fastify';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { generateRequestId } from './middleware/request-id.js';
import { healthRoutes } from './routes/health.js';
import { botRoutes } from './routes/bot.js';
import { authRoutes } from './features/auth/routes.js';
import { meRoutes } from './features/me/routes.js';
import { buildingsRoutes } from './features/buildings/routes.js';
import { resourcesRoutes } from './features/resources/routes.js';
import { shipsRoutes } from './features/ships/routes.js';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

const fastify = Fastify({
  loggerInstance: logger,
  disableRequestLogging: env.NODE_ENV === 'production',
  genReqId: generateRequestId,
  requestIdLogLabel: 'requestId',
});

fastify.addHook('preHandler', async (request) => {
  if (request.user) {
    request.log = request.log.child({ userId: request.user.id });
  }
});

await fastify.register(cors);
await fastify.register(helmet);

await fastify.register(healthRoutes);
await fastify.register(botRoutes);
await fastify.register(authRoutes, { prefix: '/auth' });
await fastify.register(meRoutes, { prefix: '/me' });
await fastify.register(buildingsRoutes, { prefix: '/buildings' });
await fastify.register(resourcesRoutes, { prefix: '/resources' });
await fastify.register(shipsRoutes, { prefix: '/ships' });

const start = async () => {
  try {
    await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
