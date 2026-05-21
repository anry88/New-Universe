import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { authRoutes } from './routes.js';
import { db } from '../../db/index.js';
import { systems, telegramRegistrationReferrals, users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { env } from '../../lib/env.js';

describe('Auth Routes', () => {
  const botToken = env.TELEGRAM_BOT_TOKEN;

  function createValidInitData(user: any, extraParams: Record<string, string> = {}): string {
    const authDate = Math.floor(Date.now() / 1000);
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

  it('should create a new user and home system on first login', async () => {
    const app = Fastify();
    await app.register(authRoutes, { prefix: '/auth' });

    const tgId = Math.floor(Math.random() * 100000000);
    const tgUser = { id: tgId, first_name: 'New', username: 'newuser', language_code: 'ru' };
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
    expect(body.user.preferredLocale).toBe('ru');
    expect(body.user.diamonds).toBe(env.DIAMOND_STARTING_GRANT);
    expect(body.user.registrationSource).toBeUndefined();
    expect(body.user.registrationSourceCode).toBeUndefined();
    expect(body.token).toBeDefined();

    const userSystem = await db.query.systems.findFirst({
      where: eq(systems.ownerId, body.user.id),
    });
    expect(userSystem?.isHome).toBe(true);

    const storedUser = await db.query.users.findFirst({
      where: eq(users.id, body.user.id),
      columns: { registrationSource: true, registrationSourceCode: true },
    });
    expect(storedUser).toMatchObject({
      registrationSource: 'direct',
      registrationSourceCode: null,
    });
  });

  it('stores Telegram start_param as the registration source for new users', async () => {
    const app = Fastify();
    await app.register(authRoutes, { prefix: '/auth' });

    const tgId = Math.floor(Math.random() * 100000000);
    const tgUser = { id: tgId, first_name: 'Referral', username: 'ref_user', language_code: 'en' };
    const initData = createValidInitData(tgUser, { start_param: '_tgr_TDf151JhYjYy' });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      headers: {
        'x-telegram-init-data': initData,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    const storedUser = await db.query.users.findFirst({
      where: eq(users.id, body.user.id),
      columns: { registrationSource: true, registrationSourceCode: true },
    });
    expect(storedUser).toMatchObject({
      registrationSource: 'telegram_start',
      registrationSourceCode: '_tgr_TDf151JhYjYy',
    });
    expect(body.user.registrationSource).toBeUndefined();
    expect(body.user.registrationSourceCode).toBeUndefined();
  });

  it('uses a pending Telegram /start referral code when initData has no start_param', async () => {
    const app = Fastify();
    await app.register(authRoutes, { prefix: '/auth' });

    const tgId = Math.floor(Math.random() * 100000000);
    await db.insert(telegramRegistrationReferrals).values({
      tgId: BigInt(tgId),
      referralCode: '_tgr_pending_code',
    });
    const tgUser = { id: tgId, first_name: 'PendingReferral', username: 'pending_ref' };
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

    const storedUser = await db.query.users.findFirst({
      where: eq(users.id, body.user.id),
      columns: { registrationSource: true, registrationSourceCode: true },
    });
    expect(storedUser).toMatchObject({
      registrationSource: 'telegram_start',
      registrationSourceCode: '_tgr_pending_code',
    });
    const pendingReferral = await db.query.telegramRegistrationReferrals.findFirst({
      where: eq(telegramRegistrationReferrals.tgId, BigInt(tgId)),
    });
    expect(pendingReferral).toBeUndefined();
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
    expect(body.user.preferredLocale).toBe('en');

    const userSystems = await db.query.systems.findMany({
      where: eq(systems.ownerId, body.user.id),
    });
    expect(userSystems.length).toBe(1);
  });

  it('does not attach a referral code to an existing user', async () => {
    const app = Fastify();
    await app.register(authRoutes, { prefix: '/auth' });

    const tgId = Math.floor(Math.random() * 100000000);
    const [existingUser] = await db
      .insert(users)
      .values({
        tgId: BigInt(tgId),
        tgUsername: `old_user_${tgId}`,
        tgFirstName: 'Old',
      })
      .returning({ id: users.id });
    const initData = createValidInitData(
      { id: tgId, first_name: 'Old', username: `old_user_${tgId}` },
      { start_param: '_tgr_should_not_attach' },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      headers: {
        'x-telegram-init-data': initData,
      },
    });

    expect(response.statusCode).toBe(200);
    const storedUser = await db.query.users.findFirst({
      where: eq(users.id, existingUser.id),
      columns: { registrationSource: true, registrationSourceCode: true },
    });
    expect(storedUser).toMatchObject({
      registrationSource: null,
      registrationSourceCode: null,
    });

    await db.delete(users).where(eq(users.id, existingUser.id));
  });
});
