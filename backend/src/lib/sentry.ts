import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 1.0,
    environment: process.env.NODE_ENV || 'development',
  });
  console.log('Sentry initialized for backend');
} else {
  console.warn('SENTRY_DSN not found, Sentry disabled');
}

export default Sentry;
