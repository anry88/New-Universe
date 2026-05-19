import { retrieveLaunchParams } from '@telegram-apps/sdk-react';

type LaunchParamReader = () => { initDataRaw?: string };

interface TelegramRuntimeOptions {
  allowMock?: boolean;
  retrieve?: LaunchParamReader;
}

export function allowsTelegramMockRuntime(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_E2E_MOCK_TELEGRAM === '1';
}

export function hasTelegramAuthLaunchParams(options: TelegramRuntimeOptions = {}): boolean {
  if (options.allowMock ?? allowsTelegramMockRuntime()) {
    return true;
  }

  try {
    return Boolean((options.retrieve ?? retrieveLaunchParams)().initDataRaw);
  } catch {
    return false;
  }
}
