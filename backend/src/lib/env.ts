import { z } from 'zod';
import dotenv from 'dotenv';
import {
  assertProductionSecurityConfig,
  DEFAULT_SERVER_SECRET,
  DEFAULT_TELEGRAM_BOT_SECRET,
} from './security.js';

function parseAdminTelegramIds(value?: string): bigint[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((raw) => raw.trim())
    .filter((raw) => raw.length > 0)
    .map((raw) => {
      const parsed = (() => {
        try {
          return BigInt(raw);
        } catch {
          throw new Error(`Invalid ADMIN_TELEGRAM_IDS value: ${raw}`);
        }
      })();

      if (parsed <= 0n) {
        throw new Error(`Invalid ADMIN_TELEGRAM_IDS value: ${raw}`);
      }

      return parsed;
    });
}

function parseTelegramChatIds(value?: string): bigint[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((raw) => raw.trim())
    .filter((raw) => raw.length > 0)
    .map((raw) => {
      try {
        return BigInt(raw);
      } catch {
        throw new Error(`Invalid ADMIN_TELEGRAM_CHAT_IDS value: ${raw}`);
      }
    })
    .filter((parsed) => parsed !== 0n);
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'y'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off', 'n'].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean env value: ${value}`);
}

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_BOT_SECRET: z.string().default(DEFAULT_TELEGRAM_BOT_SECRET),
  TELEGRAM_APP_URL: z.string().url().optional().or(z.literal('')).transform(v => v === '' ? undefined : v),
  PUBLIC_FRONTEND_URL: z.string().url().optional().or(z.literal('')).transform(v => v === '' ? undefined : v),
  ADMIN_TELEGRAM_IDS: z.string().transform(parseAdminTelegramIds).optional().default(''),
  ADMIN_TELEGRAM_CHAT_IDS: z.string().transform(parseTelegramChatIds).optional().default(''),
  JWT_SECRET: z.string().min(8),
  SERVER_SECRET: z.string().default(DEFAULT_SERVER_SECRET),
  SENTRY_DSN: z.string().url().optional().or(z.literal('')).transform(v => v === '' ? undefined : v),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().min(1).default(600),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).default(20),
  RATE_LIMIT_MUTATION_MAX: z.coerce.number().int().min(1).default(120),
  RATE_LIMIT_WEBHOOK_MAX: z.coerce.number().int().min(1).default(600),
  RATE_LIMIT_STORE: z.enum(['memory', 'redis']).default('memory'),
  /** Diamonds granted once when a Telegram account creates its first user row. */
  DIAMOND_STARTING_GRANT: z.coerce.number().int().min(0).default(1000),
  /** Rush pricing curve multiplier (`minutes^0.85 * rate`, rounded). */
  DIAMOND_RUSH_PER_MINUTE: z.coerce.number().int().min(1).default(1),
  /** Optional cap per rush action; 0 = uncapped. */
  DIAMOND_RUSH_MAX_PER_ACTION: z.coerce.number().int().min(0).default(0),
  /** Toggle BullMQ-backed delayed jobs for ships. */
  ENABLE_BULLMQ: z
    .string()
    .optional()
    .transform((value) => parseBooleanEnv(value, true)),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(result.error.format(), null, 2));
  process.exit(1);
}

try {
  assertProductionSecurityConfig(result.data);
} catch (err) {
  console.error('❌ Invalid production security configuration:', err instanceof Error ? err.message : err);
  process.exit(1);
}

export const env = result.data;
