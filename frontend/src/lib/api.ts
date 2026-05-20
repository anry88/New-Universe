import { retrieveLaunchParams } from '@telegram-apps/sdk-react';
import {
  ONLINE_ACTIVITY_HEADER,
  ONLINE_ACTIVITY_HEADER_VALUE,
  type StartOnlineSessionResponse,
} from '@shared/types/activity';
import { getUiLocale } from './locale';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function readApiErrorString(body: unknown, key: 'message' | 'error'): string | null {
  if (body !== null && typeof body === 'object' && key in body) {
    const v = (body as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : null;
  }
  return null;
}

let sessionToken: string | null = null;
let onlineActivityTrackingEnabled = false;

export const setSessionToken = (token: string | null) => {
  sessionToken = token;
};

export const setOnlineActivityTrackingEnabled = (enabled: boolean) => {
  onlineActivityTrackingEnabled = enabled;
};

function shouldSendOnlineActivityHeader(): boolean {
  if (!onlineActivityTrackingEnabled) return false;
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible';
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  
  const headers = new Headers(options.headers);
  headers.set('Accept-Language', getUiLocale());

  if (sessionToken) {
    headers.set('Authorization', `Bearer ${sessionToken}`);
  }

  if (sessionToken && shouldSendOnlineActivityHeader()) {
    headers.set(ONLINE_ACTIVITY_HEADER, ONLINE_ACTIVITY_HEADER_VALUE);
  }
  
  try {
    const { initDataRaw } = retrieveLaunchParams();
    if (initDataRaw) {
      headers.set('X-Telegram-Init-Data', initDataRaw);
    }
  } catch {
    // SDK not available
  }

  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData: unknown = await response.json().catch(() => ({}));
    const message =
      readApiErrorString(errorData, 'message') ??
      readApiErrorString(errorData, 'error') ??
      `API Error: ${response.status}`;
    const error = new Error(message) as Error & {
      status?: number;
      data?: unknown;
    };
    error.message = message;
    error.status = response.status;
    error.data = errorData;
    throw error;
  }

  return response.json();
}

export async function openOnlineActivitySession(): Promise<StartOnlineSessionResponse> {
  const previousTrackingState = onlineActivityTrackingEnabled;
  onlineActivityTrackingEnabled = false;

  try {
    const response = await apiFetch<StartOnlineSessionResponse>('/me/session/start', {
      method: 'POST',
    });
    onlineActivityTrackingEnabled = true;
    return response;
  } catch (err) {
    onlineActivityTrackingEnabled = previousTrackingState;
    throw err;
  }
}
