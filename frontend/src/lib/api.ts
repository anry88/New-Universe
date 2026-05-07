import { retrieveLaunchParams } from '@telegram-apps/sdk-react';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(errorData.message || `API Error: ${response.status}`) as Error & {
      status?: number;
      data?: any;
    };
    error.status = response.status;
    error.data = errorData;
    throw error;
  }

  return response.json();
}
