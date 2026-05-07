import { z } from 'zod';
import dotenv from 'dotenv';

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
  JWT_SECRET: z.string().min(8),
  SENTRY_DSN: z.string().url().optional().or(z.literal('')).transform(v => v === '' ? undefined : v),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(result.error.format(), null, 2));
  process.exit(1);
}

export const env = result.data;
