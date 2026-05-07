let applied = false;

export function setDefaultTestEnv(): void {
  if (applied) return;
  applied = true;

  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://nu:devpassword@localhost:5432/new_universe';
  process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
  process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
  process.env.TELEGRAM_BOT_SECRET = process.env.TELEGRAM_BOT_SECRET || 'dev-secret-change-me-32-chars';
  process.env.PUBLIC_FRONTEND_URL = process.env.PUBLIC_FRONTEND_URL || 'https://test-app.nu';
  process.env.TELEGRAM_APP_URL = process.env.TELEGRAM_APP_URL || 'https://t.me/TestBot/app';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-me-32-chars';
}
