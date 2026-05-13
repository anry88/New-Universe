import { describe, expect, it } from 'vitest';
import { rateLimitKeyGenerator } from './rate-limit.js';
import type { FastifyRequest } from 'fastify';

function request(headers: Record<string, string | undefined>, ip = '203.0.113.10') {
  return { headers, ip } as unknown as FastifyRequest;
}

describe('rateLimitKeyGenerator', () => {
  it('keys authenticated users by a hash of the session token', () => {
    const key = rateLimitKeyGenerator(request({ authorization: 'Bearer secret-session-token' }));

    expect(key).toMatch(/^session:[a-f0-9]{24}$/);
    expect(key).not.toContain('secret-session-token');
  });

  it('keys Telegram initData attempts separately from raw header contents', () => {
    const key = rateLimitKeyGenerator(request({ 'x-telegram-init-data': 'auth_date=1&hash=secret' }));

    expect(key).toMatch(/^telegram-init:[a-f0-9]{24}:203\.0\.113\.10$/);
    expect(key).not.toContain('auth_date=1&hash=secret');
  });

  it('falls back to IP address for anonymous requests', () => {
    expect(rateLimitKeyGenerator(request({}))).toBe('ip:203.0.113.10');
  });
});
