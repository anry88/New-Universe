import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';

export const DEFAULT_TELEGRAM_BOT_SECRET = 'dev-secret-change-me';
export const DEFAULT_SERVER_SECRET = 'dev-server-secret-change-me';

export type SecurityValidationKind =
  | 'body'
  | 'params'
  | 'body-and-params'
  | 'telegram-init-data'
  | 'telegram-webhook'
  | 'session-no-body';

export interface SecurityRouteConfig {
  rateLimit: {
    max: number;
    timeWindow: string | number;
  };
  security: {
    validation: SecurityValidationKind;
  };
}

export function securityRouteConfig(
  rateLimit: SecurityRouteConfig['rateLimit'],
  validation: SecurityValidationKind,
): SecurityRouteConfig {
  return {
    rateLimit,
    security: { validation },
  };
}

export const nonEmptyStringSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 256,
} as const;

export const safeIntegerSchema = {
  type: 'integer',
  minimum: -1_000_000_000,
  maximum: 1_000_000_000,
} as const;

export const boundedNumberSchema = {
  type: 'number',
  minimum: -1_000_000_000,
  maximum: 1_000_000_000,
} as const;

export const nonNegativeNumberSchema = {
  type: 'number',
  minimum: 0,
  maximum: 1_000_000_000_000,
} as const;

export const positiveNumberSchema = {
  type: 'number',
  exclusiveMinimum: 0,
  maximum: 1_000_000_000_000,
} as const;

export const optionalNullableStringSchema = {
  anyOf: [nonEmptyStringSchema, { type: 'null' }],
} as const;

export function objectBodySchema(
  properties: Record<string, unknown>,
  required: string[],
) {
  return {
    type: 'object',
    required,
    properties,
    additionalProperties: false,
  } as const;
}

export function paramsSchema(properties: Record<string, unknown>, required: string[]) {
  return objectBodySchema(properties, required);
}

export const planetIdParamsSchema = paramsSchema(
  { planetId: nonEmptyStringSchema },
  ['planetId'],
);

export const systemIdParamsSchema = paramsSchema(
  { systemId: nonEmptyStringSchema },
  ['systemId'],
);

export function constantTimeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export interface ParsedSessionToken {
  userId: string;
}

export type SessionTokenResult =
  | { ok: true; payload: ParsedSessionToken }
  | { ok: false; status: 401; body: { error: string; message: string } };

export function readBearerToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
}

export function verifySessionToken(token: string, jwtSecret: string): SessionTokenResult {
  try {
    const payload = jwt.verify(token, jwtSecret) as Partial<ParsedSessionToken>;
    if (!payload.userId || typeof payload.userId !== 'string') {
      return {
        ok: false,
        status: 401,
        body: {
          error: 'Unauthorized',
          message: 'Invalid or expired session token',
        },
      };
    }

    return { ok: true, payload: { userId: payload.userId } };
  } catch {
    return {
      ok: false,
      status: 401,
      body: {
        error: 'Unauthorized',
        message: 'Invalid or expired session token',
      },
    };
  }
}

export async function requireSessionUserId(
  request: FastifyRequest,
  reply: FastifyReply,
  jwtSecret: string,
): Promise<string | null> {
  const token = readBearerToken(request);
  if (!token) {
    reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing session token',
    });
    return null;
  }

  const result = verifySessionToken(token, jwtSecret);
  if (!result.ok) {
    reply.status(result.status).send(result.body);
    return null;
  }

  request.userId = result.payload.userId;
  return result.payload.userId;
}

export function verifyTelegramWebhookSecret(
  providedSecret: string | string[] | undefined,
  expectedSecret: string,
  required: boolean,
): boolean {
  if (Array.isArray(providedSecret)) {
    return false;
  }

  if (!providedSecret) {
    return !required;
  }

  return constantTimeEqual(providedSecret, expectedSecret);
}

export interface ProductionSecurityConfig {
  NODE_ENV: 'development' | 'test' | 'production';
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_BOT_SECRET: string;
  JWT_SECRET: string;
  SERVER_SECRET: string;
  PUBLIC_FRONTEND_URL?: string;
  TELEGRAM_APP_URL?: string;
}

function looksLikePlaceholderSecret(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes('change-me') ||
    normalized.includes('default-secret') ||
    normalized.includes('dev-secret') ||
    normalized.includes('test-secret')
  );
}

function validateStrongSecret(name: string, value: string, minLength: number): string | null {
  if (value.length < minLength) {
    return `${name} must be at least ${minLength} characters in production`;
  }

  if (looksLikePlaceholderSecret(value)) {
    return `${name} must not use development placeholder text in production`;
  }

  return null;
}

export function productionSecurityErrors(config: ProductionSecurityConfig): string[] {
  if (config.NODE_ENV !== 'production') {
    return [];
  }

  const errors = [
    validateStrongSecret('JWT_SECRET', config.JWT_SECRET, 32),
    validateStrongSecret('SERVER_SECRET', config.SERVER_SECRET, 32),
    validateStrongSecret('TELEGRAM_BOT_SECRET', config.TELEGRAM_BOT_SECRET, 32),
  ].filter((error): error is string => Boolean(error));

  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(config.TELEGRAM_BOT_TOKEN)) {
    errors.push('TELEGRAM_BOT_TOKEN must look like a Telegram Bot API token in production');
  }

  if (!config.PUBLIC_FRONTEND_URL || !config.TELEGRAM_APP_URL) {
    errors.push('PUBLIC_FRONTEND_URL and TELEGRAM_APP_URL must be provided by production secrets/config');
  }

  return errors;
}

export function assertProductionSecurityConfig(config: ProductionSecurityConfig): void {
  const errors = productionSecurityErrors(config);
  if (errors.length > 0) {
    throw new Error(`Production security configuration is invalid:\n${errors.join('\n')}`);
  }
}
