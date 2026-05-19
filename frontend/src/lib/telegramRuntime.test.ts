import { describe, expect, it } from 'vitest';
import { hasTelegramAuthLaunchParams } from './telegramRuntime';

describe('telegramRuntime', () => {
  it('allows dev/e2e mock runtime explicitly', () => {
    expect(hasTelegramAuthLaunchParams({ allowMock: true, retrieve: () => ({}) })).toBe(true);
  });

  it('requires Telegram initDataRaw when mock runtime is disabled', () => {
    expect(
      hasTelegramAuthLaunchParams({
        allowMock: false,
        retrieve: () => ({ initDataRaw: 'user=1&hash=abc' }),
      }),
    ).toBe(true);
    expect(
      hasTelegramAuthLaunchParams({
        allowMock: false,
        retrieve: () => ({}),
      }),
    ).toBe(false);
  });

  it('blocks plain browser runtime when launch params cannot be read', () => {
    expect(
      hasTelegramAuthLaunchParams({
        allowMock: false,
        retrieve: () => {
          throw new Error('no launch params');
        },
      }),
    ).toBe(false);
  });
});
