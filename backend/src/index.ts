import './lib/sentry.js';
import Fastify from 'fastify';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { generateRequestId } from './middleware/request-id.js';
import { healthRoutes } from './routes/health.js';
import { metricsRoutes } from './routes/metrics.js';
import { botRoutes } from './routes/bot.js';
import { authRoutes } from './features/auth/routes.js';
import { meRoutes } from './features/me/routes.js';
import { buildingsRoutes } from './features/buildings/routes.js';
import { resourcesRoutes } from './features/resources/routes.js';
import { shipsRoutes } from './features/ships/routes.js';
import { expeditionsRoutes } from './features/expeditions/routes.js';
import { researchRoutes } from './features/research/routes.js';
import { tutorialRoutes } from './features/tutorial/routes.js';
import { coloniesRoutes } from './routes/colonies.js';
import { cargoRoutes } from './routes/cargo.js';
import { multiplayerRoutes } from './routes/multiplayer.js';
import { jumpGateRoutes } from './features/jump-gate/routes.js';
import { systemsRoutes } from './features/systems/routes.js';
import { monetizationRoutes } from './features/monetization/routes.js';
import { closeBuildingCompletionQueueProducer, warmBuildingCompletionQueueProducer } from './features/buildings/completion-queue.js';
import { closeShipCompletionQueueProducer, warmShipCompletionQueueProducer } from './features/ships/completion-queue.js';
import { closeCargoRouteQueueProducer, warmCargoRouteQueueProducer } from './features/logistics/completion-queue.js';
import { registerRateLimit } from './lib/rate-limit.js';
import { recordHttpRequest } from './lib/metrics.js';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

const requestStartTimes = new WeakMap<object, bigint>();

const fastify = Fastify({
  loggerInstance: logger,
  disableRequestLogging: env.NODE_ENV === 'production',
  genReqId: generateRequestId,
  requestIdLogLabel: 'requestId',
});

fastify.addHook('onRequest', async (request) => {
  requestStartTimes.set(request, process.hrtime.bigint());
});

fastify.addHook('preHandler', async (request) => {
  if (request.user) {
    request.log = request.log.child({ userId: request.user.id });
  }
});

fastify.addHook('onResponse', async (request, reply) => {
  const route = request.routeOptions.url ?? request.url;
  if (route === '/metrics') return;

  const startedAt = requestStartTimes.get(request);
  const durationSeconds = startedAt
    ? Number(process.hrtime.bigint() - startedAt) / 1_000_000_000
    : 0;

  recordHttpRequest({
    method: request.method,
    route,
    statusCode: reply.statusCode,
    durationSeconds,
  });
});

fastify.addHook('onClose', async () => {
  await Promise.all([
    closeBuildingCompletionQueueProducer(),
    closeShipCompletionQueueProducer(),
    closeCargoRouteQueueProducer(),
  ]);
});

await fastify.register(cors);
await fastify.register(helmet);
await registerRateLimit(fastify);

await fastify.register(healthRoutes);
await fastify.register(metricsRoutes);
await fastify.register(botRoutes);
await fastify.register(authRoutes, { prefix: '/auth' });
await fastify.register(meRoutes, { prefix: '/me' });
await fastify.register(buildingsRoutes, { prefix: '/buildings' });
await fastify.register(resourcesRoutes, { prefix: '/resources' });
await fastify.register(shipsRoutes, { prefix: '/ships' });
await fastify.register(expeditionsRoutes, { prefix: '/expeditions' });
await fastify.register(researchRoutes, { prefix: '/research' });
await fastify.register(tutorialRoutes, { prefix: '/tutorial' });
await fastify.register(coloniesRoutes, { prefix: '/colonies' });
await fastify.register(cargoRoutes, { prefix: '/cargo' });
await fastify.register(multiplayerRoutes, { prefix: '/multiplayer' });
await fastify.register(jumpGateRoutes, { prefix: '/jump-gate' });
await fastify.register(systemsRoutes, { prefix: '/systems' });
await fastify.register(monetizationRoutes, { prefix: '/monetization' });

warmBuildingCompletionQueueProducer();
warmShipCompletionQueueProducer();
warmCargoRouteQueueProducer();

const start = async () => {
  try {
    await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
