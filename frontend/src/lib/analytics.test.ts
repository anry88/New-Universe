import { describe, expect, it } from 'vitest';
import { buildFrontendAnalyticsEvent } from './analytics';

describe('frontend analytics', () => {
  it('uses shared event metadata and filters unsafe properties', () => {
    const event = buildFrontendAnalyticsEvent('page_viewed', {
      path: '/research',
      tutorialCompleted: true,
      telegramInitData: 'raw-init-data',
      token: 'secret-token',
      username: 'pilot',
    });

    expect(event).toMatchObject({
      event: 'analytics.event',
      analyticsEvent: 'page_viewed',
      category: 'retention',
      source: 'frontend',
      properties: {
        path: '/research',
      },
    });
    expect(event.sessionId.length).toBeGreaterThan(0);
    expect(event.properties).not.toHaveProperty('tutorialCompleted');
    expect(event.properties).not.toHaveProperty('telegramInitData');
    expect(event.properties).not.toHaveProperty('token');
    expect(event.properties).not.toHaveProperty('username');
  });

  it('keeps safe Telegram-environment booleans without allowing Telegram identity fields', () => {
    const event = buildFrontendAnalyticsEvent('client_session_started', {
      path: '/',
      isTelegramEnvironment: true,
      telegramUser: 'raw-user',
    });

    expect(event.properties).toMatchObject({
      path: '/',
      isTelegramEnvironment: true,
    });
    expect(event.properties).not.toHaveProperty('telegramUser');
  });
});
