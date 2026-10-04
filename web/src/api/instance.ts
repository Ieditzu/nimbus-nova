import { createNovaClient, type NovaClient } from './client';
import { posterToken } from './session';

export function apiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') return window.location.origin;
  }
  return 'http://127.0.0.1:8080';
}

function liveClient() {
  return createNovaClient(apiBaseUrl(), { token: posterToken() });
}

export const api: NovaClient = new Proxy({} as NovaClient, {
  get(_target, prop) {
    const client = liveClient();
    const value = client[prop as keyof NovaClient];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
