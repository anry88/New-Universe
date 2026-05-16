import { describe, expect, it } from 'vitest';
import {
  analyticsNumberBand,
  analyticsUserIdHash,
  buildBackendAnalyticsEvent,
} from './analytics.js';

describe('backend analytics', () => {
  it('hashes user ids without exposing raw ids', () => {
    const first = analyticsUserIdHash('user-123');
    const second = analyticsUserIdHash('user-123');

    expect(first).toBe(second);
    expect(first).not.toContain('user-123');
    expect(first).toHaveLength(24);
  });

  it('drops unsafe properties before building the envelope', () => {
    const event = buildBackendAnalyticsEvent(
      'session_authenticated',
      {
        locale: 'ru',
        path: '/profile',
        telegramInitData: 'raw-init-data',
        token: 'secret-token',
        username: 'pilot',
        tutorialCompleted: false,
      },
      { userId: 'user-123', requestId: 'req-1' },
    );

    expect(event).toMatchObject({
      event: 'analytics.event',
      analyticsEvent: 'session_authenticated',
      category: 'retention',
      source: 'backend',
      requestId: 'req-1',
      properties: {
        locale: 'ru',
        tutorialCompleted: false,
      },
    });
    expect(event.userIdHash).toBe(analyticsUserIdHash('user-123'));
    expect(event.properties).not.toHaveProperty('path');
    expect(event.properties).not.toHaveProperty('telegramInitData');
    expect(event.properties).not.toHaveProperty('token');
    expect(event.properties).not.toHaveProperty('username');
  });

  it('builds stable numeric bands for high-cardinality values', () => {
    expect(analyticsNumberBand(0, 100)).toBe('0-99');
    expect(analyticsNumberBand(175, 100)).toBe('100-199');
    expect(analyticsNumberBand(Number.NaN, 100)).toBe('unknown');
  });
});
