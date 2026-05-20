import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { authRoutes } from '../features/auth/routes.js';
import { buildingsRoutes } from '../features/buildings/routes.js';
import { resourcesRoutes } from '../features/resources/routes.js';
import { shipsRoutes } from '../features/ships/routes.js';
import { expeditionsRoutes } from '../features/expeditions/routes.js';
import { researchRoutes } from '../features/research/routes.js';
import { tutorialRoutes } from '../features/tutorial/routes.js';
import { coloniesRoutes } from '../routes/colonies.js';
import { cargoRoutes } from '../routes/cargo.js';
import { botRoutes } from '../routes/bot.js';
import { jumpGateRoutes } from '../features/jump-gate/routes.js';
import { meRoutes } from '../features/me/routes.js';
import {
  assertProductionSecurityConfig,
  constantTimeEqual,
  productionSecurityErrors,
  verifyTelegramWebhookSecret,
  type SecurityValidationKind,
} from './security.js';

type CapturedRoute = {
  method: string;
  url: string;
  config?: Record<string, any>;
  schema?: Record<string, any>;
};

const mutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function captureApplicationRoutes(): Promise<CapturedRoute[]> {
  const app = Fastify();
  const captured: CapturedRoute[] = [];

  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      captured.push({
        method,
        url: route.url,
        config: route.config as Record<string, any> | undefined,
        schema: route.schema as Record<string, any> | undefined,
      });
    }
  });

  await app.register(botRoutes);
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(meRoutes, { prefix: '/me' });
  await app.register(buildingsRoutes, { prefix: '/buildings' });
  await app.register(resourcesRoutes, { prefix: '/resources' });
  await app.register(shipsRoutes, { prefix: '/ships' });
  await app.register(expeditionsRoutes, { prefix: '/expeditions' });
  await app.register(researchRoutes, { prefix: '/research' });
  await app.register(tutorialRoutes, { prefix: '/tutorial' });
  await app.register(coloniesRoutes, { prefix: '/colonies' });
  await app.register(cargoRoutes, { prefix: '/cargo' });
  await app.register(jumpGateRoutes, { prefix: '/jump-gate' });
  await app.ready();
  await app.close();

  return captured;
}

function mutationRouteName(route: CapturedRoute): string {
  return `${route.method} ${route.url}`;
}

function validationKind(route: CapturedRoute): SecurityValidationKind | undefined {
  return route.config?.security?.validation;
}

describe('security primitives', () => {
  it('uses constant-time equality for same-length secrets', () => {
    expect(constantTimeEqual('abc123', 'abc123')).toBe(true);
    expect(constantTimeEqual('abc123', 'abc124')).toBe(false);
    expect(constantTimeEqual('abc123', 'abc1234')).toBe(false);
  });

  it('requires strong production secrets and launch URLs', () => {
    const weakErrors = productionSecurityErrors({
      NODE_ENV: 'production',
      TELEGRAM_BOT_TOKEN: 'dev-token',
      TELEGRAM_BOT_SECRET: 'dev-secret-change-me',
      JWT_SECRET: 'dev-jwt-secret-change-me',
      SERVER_SECRET: 'default-secret',
    });

    expect(weakErrors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('JWT_SECRET'),
        expect.stringContaining('SERVER_SECRET'),
        expect.stringContaining('TELEGRAM_BOT_SECRET'),
        expect.stringContaining('TELEGRAM_BOT_TOKEN'),
        expect.stringContaining('PUBLIC_FRONTEND_URL'),
      ]),
    );

    expect(() =>
      assertProductionSecurityConfig({
        NODE_ENV: 'production',
        TELEGRAM_BOT_TOKEN: '123456789:abcdefghijklmnopqrstuvwxyzABCDE',
        TELEGRAM_BOT_SECRET: 'telegram-webhook-secret-with-32-chars',
        JWT_SECRET: 'jwt-secret-with-enough-entropy-32-chars',
        SERVER_SECRET: 'server-secret-with-enough-entropy-32',
        PUBLIC_FRONTEND_URL: 'https://app.example.test',
        TELEGRAM_APP_URL: 'https://t.me/example/app',
      }),
    ).not.toThrow();
  });

  it('validates Telegram webhook secrets only when required or provided', () => {
    expect(verifyTelegramWebhookSecret(undefined, 'expected-secret', false)).toBe(true);
    expect(verifyTelegramWebhookSecret(undefined, 'expected-secret', true)).toBe(false);
    expect(verifyTelegramWebhookSecret('expected-secret', 'expected-secret', true)).toBe(true);
    expect(verifyTelegramWebhookSecret('wrong-secret', 'expected-secret', true)).toBe(false);
    expect(verifyTelegramWebhookSecret(['expected-secret'], 'expected-secret', true)).toBe(false);
  });
});

describe('public mutation endpoint security', () => {
  it('requires rate limits and explicit validation metadata on every public mutation route', async () => {
    const mutations = (await captureApplicationRoutes()).filter((route) =>
      mutationMethods.has(route.method),
    );

    const missingRateLimits = mutations
      .filter((route) => !route.config?.rateLimit)
      .map(mutationRouteName);
    const missingValidation = mutations
      .filter((route) => !validationKind(route))
      .map(mutationRouteName);

    expect(missingRateLimits).toEqual([]);
    expect(missingValidation).toEqual([]);
  });

  it('requires JSON schemas for mutation routes that validate body or params', async () => {
    const mutations = (await captureApplicationRoutes()).filter((route) =>
      mutationMethods.has(route.method),
    );

    const missingSchemas = mutations
      .filter((route) => {
        const validation = validationKind(route);
        if (validation === 'body') return !route.schema?.body;
        if (validation === 'params') return !route.schema?.params;
        if (validation === 'body-and-params') {
          return !route.schema?.body || !route.schema?.params;
        }
        return false;
      })
      .map(mutationRouteName);

    expect(missingSchemas).toEqual([]);
  });
});
