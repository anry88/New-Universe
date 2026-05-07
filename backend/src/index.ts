import Fastify from 'fastify';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { healthRoutes } from './routes/health.js';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

const fastify = Fastify({
  loggerInstance: logger,
  disableRequestLogging: env.NODE_ENV === 'production',
});

// Plugins
await fastify.register(cors);
await fastify.register(helmet);

await fastify.register(healthRoutes);

const start = async () => {
  try {
    await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
