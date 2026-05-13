import { z } from 'zod';
import dotenv from 'dotenv';

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

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_BOT_SECRET: z.string().default('dev-secret-change-me'),
  TELEGRAM_APP_URL: z.string().url().optional().or(z.literal('')).transform(v => v === '' ? undefined : v),
  PUBLIC_FRONTEND_URL: z.string().url().optional().or(z.literal('')).transform(v => v === '' ? undefined : v),
  ADMIN_TELEGRAM_IDS: z.string().transform(parseAdminTelegramIds).optional().default(''),
  JWT_SECRET: z.string().min(8),
  SENTRY_DSN: z.string().url().optional().or(z.literal('')).transform(v => v === '' ? undefined : v),
  /** Diamonds granted once when a Telegram account creates its first user row. */
  DIAMOND_STARTING_GRANT: z.coerce.number().int().min(0).default(1000),
  /** Rush pricing curve multiplier (`minutes^0.85 * rate`, rounded). */
  DIAMOND_RUSH_PER_MINUTE: z.coerce.number().int().min(1).default(1),
  /** Optional cap per rush action; 0 = uncapped. */
  DIAMOND_RUSH_MAX_PER_ACTION: z.coerce.number().int().min(0).default(0),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(result.error.format(), null, 2));
  process.exit(1);
}

export const env = result.data;
