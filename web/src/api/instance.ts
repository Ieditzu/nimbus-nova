import { createNovaClient } from './client';

export function apiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') return window.location.origin;
  }
  return 'http://127.0.0.1:8080';
}

export const api = createNovaClient(apiBaseUrl(), 'poster-1');
