import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { authRoutes } from './routes.js';
import { db } from '../../db/index.js';
import { systems } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { env } from '../../lib/env.js';

describe('Auth Routes', () => {
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

  it('should create a new user and home system on first login', async () => {
    const app = Fastify();
    await app.register(authRoutes, { prefix: '/auth' });

    const tgId = Math.floor(Math.random() * 100000000);
    const tgUser = { id: tgId, first_name: 'New', username: 'newuser' };
    const initData = createValidInitData(tgUser);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      headers: {
        'x-telegram-init-data': initData,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.tgId).toBe(tgId.toString());
    expect(body.token).toBeDefined();

    const userSystem = await db.query.systems.findFirst({
      where: eq(systems.ownerId, body.user.id),
    });
    expect(userSystem?.isHome).toBe(true);
  });

  it('should return existing user on subsequent login', async () => {
    const app = Fastify();
    await app.register(authRoutes, { prefix: '/auth' });

    const tgId = Math.floor(Math.random() * 100000000);
    const tgUser = { id: tgId, first_name: 'Existing', username: 'olduser' };
    const initData = createValidInitData(tgUser);

    await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      headers: {
        'x-telegram-init-data': initData,
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      headers: {
        'x-telegram-init-data': initData,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.tgId).toBe(tgId.toString());
    
    const userSystems = await db.query.systems.findMany({
      where: eq(systems.ownerId, body.user.id),
    });
    expect(userSystems.length).toBe(1);
  });
});
