import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

function sampleRate(value: string | undefined, fallback: number): number {
  const parsed = value && value.trim() !== '' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

if (dsn) {
  const tracesSampleRate = sampleRate(
    process.env.SENTRY_TRACES_SAMPLE_RATE,
    process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  );

  Sentry.init({
    dsn,
    tracesSampleRate,
    environment: process.env.NODE_ENV || 'development',
  });
  console.log('Sentry initialized for backend');
} else {
  console.warn('SENTRY_DSN not found, Sentry disabled');
}

export default Sentry;
