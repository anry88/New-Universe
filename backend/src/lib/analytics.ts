import { createHmac } from 'node:crypto';
import {
  ANALYTICS_EVENT_DEFINITIONS,
  sanitizeAnalyticsEventProperties,
  type AnalyticsEventNameForSurface,
  type AnalyticsProperties,
  type AnalyticsSurface,
  type SafeAnalyticsProperties,
} from '@shared/types/analytics.js';
import { env } from './env.js';
import { logger } from './logger.js';

export interface BackendAnalyticsContext {
  userId?: string;
  requestId?: string;
}

export interface BackendAnalyticsEnvelope {
  event: 'analytics.event';
  analyticsEvent: AnalyticsEventNameForSurface<'backend'>;
  category: (typeof ANALYTICS_EVENT_DEFINITIONS)[keyof typeof ANALYTICS_EVENT_DEFINITIONS]['category'];
  source: AnalyticsSurface;
  userIdHash?: string;
  requestId?: string;
  properties: SafeAnalyticsProperties;
}

export function analyticsUserIdHash(userId: string): string {
  return createHmac('sha256', env.SERVER_SECRET).update(userId).digest('hex').slice(0, 24);
}

export function analyticsNumberBand(value: number, bucketSize = 1000): string {
  if (!Number.isFinite(value) || bucketSize <= 0) {
    return 'unknown';
  }

  const bucketStart = Math.floor(Math.max(0, value) / bucketSize) * bucketSize;
  return `${bucketStart}-${bucketStart + bucketSize - 1}`;
}

export function buildBackendAnalyticsEvent(
  name: AnalyticsEventNameForSurface<'backend'>,
  properties: AnalyticsProperties = {},
  context: BackendAnalyticsContext = {},
): BackendAnalyticsEnvelope {
  const definition = ANALYTICS_EVENT_DEFINITIONS[name];
  return {
    event: 'analytics.event',
    analyticsEvent: name,
    category: definition.category,
    source: 'backend',
    userIdHash: context.userId ? analyticsUserIdHash(context.userId) : undefined,
    requestId: context.requestId,
    properties: sanitizeAnalyticsEventProperties(name, properties),
  };
}

export function trackBackendEvent(
  name: AnalyticsEventNameForSurface<'backend'>,
  properties: AnalyticsProperties = {},
  context: BackendAnalyticsContext = {},
): BackendAnalyticsEnvelope {
  const envelope = buildBackendAnalyticsEvent(name, properties, context);
  logger.info(envelope, 'Analytics event');
  return envelope;
}
