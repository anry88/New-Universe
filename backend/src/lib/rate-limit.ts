import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Redis } from 'ioredis';
import crypto from 'node:crypto';
import { env } from './env.js';
import { apiErrorPayload, resolveRequestLocale } from './i18n.js';

export const globalRateLimit = {
  max: env.RATE_LIMIT_GLOBAL_MAX,
  timeWindow: env.RATE_LIMIT_WINDOW,
} as const;

export const authRateLimit = {
  max: env.RATE_LIMIT_AUTH_MAX,
  timeWindow: env.RATE_LIMIT_WINDOW,
} as const;

export const mutationRateLimit = {
  max: env.RATE_LIMIT_MUTATION_MAX,
  timeWindow: env.RATE_LIMIT_WINDOW,
} as const;

export const webhookRateLimit = {
  max: env.RATE_LIMIT_WEBHOOK_MAX,
  timeWindow: env.RATE_LIMIT_WINDOW,
} as const;

function hashRateLimitPart(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
}

export function rateLimitKeyGenerator(request: FastifyRequest): string {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return `session:${hashRateLimitPart(authHeader.slice(7))}`;
  }

  const initData = request.headers['x-telegram-init-data'];
  if (typeof initData === 'string') {
    return `telegram-init:${hashRateLimitPart(initData)}:${request.ip}`;
  }

  return `ip:${request.ip}`;
}

export async function registerRateLimit(app: FastifyInstance<any, any, any, any>): Promise<void> {
  let redis: InstanceType<typeof Redis> | undefined;

  if (env.NODE_ENV === 'production') {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });

    app.addHook('onClose', async () => {
      await redis?.quit();
    });
  }

  await app.register(rateLimit, {
    global: true,
    max: globalRateLimit.max,
    timeWindow: globalRateLimit.timeWindow,
    redis,
    keyGenerator: rateLimitKeyGenerator,
    errorResponseBuilder: (request, context) => ({
      ...apiErrorPayload('rateLimitExceeded', resolveRequestLocale(request)),
      retryAfter: context.ttl,
    }),
  });
}
