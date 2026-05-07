import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { healthRoutes } from './health.js';

describe('healthRoutes', () => {
  it('returns an ok health payload', async () => {
    const app = Fastify({ logger: false });
    await app.register(healthRoutes);

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; ts: string; uptime: number }>();
    expect(body.status).toBe('ok');
    expect(Date.parse(body.ts)).not.toBeNaN();
    expect(typeof body.uptime).toBe('number');

    await app.close();
  });
});
