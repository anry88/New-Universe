import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { metricsRoutes } from './metrics.js';

describe('metricsRoutes', () => {
  it('returns Prometheus text metrics', async () => {
    const app = Fastify({ logger: false });
    await app.register(metricsRoutes, {
      collect: async () => '# HELP nu_api_up test\n# TYPE nu_api_up gauge\nnu_api_up 1\n',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('nu_api_up 1');

    await app.close();
  });
});
