import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import { telegramAuthMiddleware } from './telegram-auth.js';
import { env } from '../lib/env.js';

describe('telegramAuthMiddleware', () => {
  const botToken = env.TELEGRAM_BOT_TOKEN;

  function createValidInitData(user: any, authDate: number, extraParams: Record<string, string> = {}): string {
    const params = new URLSearchParams();
    params.append('auth_date', authDate.toString());
    params.append('user', JSON.stringify(user));
    for (const [key, value] of Object.entries(extraParams)) {
      params.append(key, value);
    }
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

  it('allows valid initData', async () => {
    const app = Fastify();
    app.get('/test', { preHandler: [telegramAuthMiddleware] }, async (req) => {
      return { user: req.user, startParam: req.telegramInitData?.start_param };
    });

    const user = { id: 123, first_name: 'Test', username: 'testuser' };
    const authDate = Math.floor(Date.now() / 1000);
    const initData = createValidInitData(user, authDate, { start_param: '_tgr_TDf151JhYjYy' });

    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: {
        'x-telegram-init-data': initData,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user, startParam: '_tgr_TDf151JhYjYy' });
  });

  it('rejects missing header', async () => {
    const app = Fastify();
    app.get('/test', { preHandler: [telegramAuthMiddleware] }, async () => ({ ok: true }));

    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toContain('Missing X-Telegram-Init-Data');
  });

  it('rejects invalid hash', async () => {
    const app = Fastify();
    app.get('/test', { preHandler: [telegramAuthMiddleware] }, async () => ({ ok: true }));

    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: {
        'x-telegram-init-data': 'auth_date=123&user={}&hash=wronghash',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toContain('Invalid Telegram initData hash');
  });

  it('rejects expired initData', async () => {
    const app = Fastify();
    app.get('/test', { preHandler: [telegramAuthMiddleware] }, async () => ({ ok: true }));

    const user = { id: 123, first_name: 'Test' };
    const oldAuthDate = Math.floor(Date.now() / 1000) - 4000;
    const initData = createValidInitData(user, oldAuthDate);

    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: {
        'x-telegram-init-data': initData,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toContain('Telegram initData expired');
  });

  it('rejects initData replayed from the future beyond clock skew', async () => {
    const app = Fastify();
    app.get('/test', { preHandler: [telegramAuthMiddleware] }, async () => ({ ok: true }));

    const user = { id: 123, first_name: 'Test' };
    const futureAuthDate = Math.floor(Date.now() / 1000) + 120;
    const initData = createValidInitData(user, futureAuthDate);

    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: {
        'x-telegram-init-data': initData,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toContain('Telegram initData expired');
  });

  it('localizes auth errors from Accept-Language', async () => {
    const app = Fastify();
    app.get('/test', { preHandler: [telegramAuthMiddleware] }, async () => ({ ok: true }));

    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: {
        'accept-language': 'ru-RU,ru;q=0.9',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toContain('Отсутствует заголовок');
  });
});
