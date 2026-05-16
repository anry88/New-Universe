import posthog from 'posthog-js';
import {
  ANALYTICS_EVENT_DEFINITIONS,
  sanitizeAnalyticsEventProperties,
  type AnalyticsEventNameForSurface,
  type AnalyticsProperties,
  type AnalyticsSurface,
  type SafeAnalyticsProperties,
} from '@shared/types/analytics';
import { getUiLocale } from './locale';

const ANALYTICS_SESSION_STORAGE_KEY = 'nu_analytics_session_id';

export interface FrontendAnalyticsEnvelope {
  event: 'analytics.event';
  analyticsEvent: AnalyticsEventNameForSurface<'frontend'>;
  category: (typeof ANALYTICS_EVENT_DEFINITIONS)[keyof typeof ANALYTICS_EVENT_DEFINITIONS]['category'];
  source: AnalyticsSurface;
  sessionId: string;
  properties: SafeAnalyticsProperties;
}

let posthogInitialized = false;

function randomSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getAnalyticsSessionId(): string {
  if (typeof sessionStorage === 'undefined') {
    return 'server-render';
  }

  try {
    const existing = sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY);
    if (existing) return existing;
    const created = randomSessionId();
    sessionStorage.setItem(ANALYTICS_SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return 'storage-unavailable';
  }
}

export function initAnalytics(): boolean {
  const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
  if (!posthogKey || posthogInitialized) {
    return posthogInitialized;
  }

  posthog.init(posthogKey, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com',
    capture_pageview: false,
    disable_session_recording: true,
  });
  posthogInitialized = true;
  return true;
}

export function buildFrontendAnalyticsEvent(
  name: AnalyticsEventNameForSurface<'frontend'>,
  properties: AnalyticsProperties = {},
): FrontendAnalyticsEnvelope {
  const definition = ANALYTICS_EVENT_DEFINITIONS[name];
  return {
    event: 'analytics.event',
    analyticsEvent: name,
    category: definition.category,
    source: 'frontend',
    sessionId: getAnalyticsSessionId(),
    properties: sanitizeAnalyticsEventProperties(name, {
      locale: getUiLocale(),
      ...properties,
    }),
  };
}

export function trackFrontendEvent(
  name: AnalyticsEventNameForSurface<'frontend'>,
  properties: AnalyticsProperties = {},
): FrontendAnalyticsEnvelope {
  const envelope = buildFrontendAnalyticsEvent(name, properties);
  const hasPosthog = initAnalytics();

  if (hasPosthog) {
    posthog.capture(name, envelope.properties);
  }

  if (import.meta.env.DEV || import.meta.env.VITE_ANALYTICS_DEBUG === '1') {
    console.debug('[analytics]', envelope);
  }

  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nu:analytics', { detail: envelope }));
  }

  return envelope;
}
