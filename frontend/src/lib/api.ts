import { retrieveLaunchParams } from '@telegram-apps/sdk-react';
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

export const setSessionToken = (token: string | null) => {
  sessionToken = token;
};

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
