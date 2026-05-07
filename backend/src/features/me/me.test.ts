import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { meRoutes } from './routes.js';
import { authRoutes } from '../auth/routes.js';
import crypto from 'crypto';
import { env } from '../../lib/env.js';

describe('Me Routes', () => {
  const botToken = env.TELEGRAM_BOT_TOKEN;

  function createValidInitData(user: any): string {
    const authDate = Math.floor(Date.now() / 1000);
    const params = new URLSearchParams();
    params.append('auth_date', authDate.toString());
    params.append('user', JSON.stringify(user));
    params.sort();

    const dataToCheck = Array.from(params.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const hash = crypto
      .createHmac('sha256', secretKey)
      .update(dataToCheck)
      .digest('hex');

    params.append('hash', hash);
    return params.toString();
  }

  it('should return user state when authorized', async () => {
    const app = Fastify();
    await app.register(authRoutes, { prefix: '/auth' });
    await app.register(meRoutes, { prefix: '/me' });

    const tgId = Math.floor(Math.random() * 100000000);
    const tgUser = { id: tgId, first_name: 'MeTest', username: 'metest' };
    const initData = createValidInitData(tgUser);

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      headers: {
        'x-telegram-init-data': initData,
      },
    });

    const { token } = loginResponse.json();

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.tgId).toBe(tgId.toString());
  });

  it('should return 401 when unauthorized', async () => {
    const app = Fastify();
    await app.register(meRoutes, { prefix: '/me' });

    const response = await app.inject({
      method: 'GET',
      url: '/me',
    });

    expect(response.statusCode).toBe(401);
  });
});
