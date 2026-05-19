import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;

function sampleRate(value: unknown, fallback: number): number {
  const parsed = typeof value === 'string' && value.trim() !== ''
    ? Number(value)
    : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

if (dsn) {
  const productionDefault = import.meta.env.MODE === 'production';
  const tracesSampleRate = sampleRate(
    import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE,
    productionDefault ? 0.1 : 1.0,
  );
  const replaysSessionSampleRate = sampleRate(
    import.meta.env.VITE_SENTRY_REPLAY_SESSION_SAMPLE_RATE,
    productionDefault ? 0.01 : 0.1,
  );
  const replaysOnErrorSampleRate = sampleRate(
    import.meta.env.VITE_SENTRY_REPLAY_ERROR_SAMPLE_RATE,
    1.0,
  );

  Sentry.init({
    dsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate,
    replaysSessionSampleRate,
    replaysOnErrorSampleRate,
    environment: import.meta.env.MODE,
  });
  console.log('Sentry initialized for frontend');
} else {
  console.warn('VITE_SENTRY_DSN not found, Sentry disabled');
}

export default Sentry;
