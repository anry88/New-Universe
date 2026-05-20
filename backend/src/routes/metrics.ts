import type { FastifyInstance } from 'fastify';
import { collectNewUniverseMetrics } from '../lib/metrics.js';

interface MetricsRoutesOptions {
  collect?: () => Promise<string>;
}

export async function metricsRoutes(fastify: FastifyInstance, options: MetricsRoutesOptions = {}) {
  const collect = options.collect ?? collectNewUniverseMetrics;

  fastify.get('/metrics', async (_request, reply) => {
    const body = await collect();
    return reply
      .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(body);
  });
}
