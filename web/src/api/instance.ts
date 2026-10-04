import { createNovaClient } from './client';

// One client for the poster surface. Also re-exported from main.tsx.
export const api = createNovaClient(import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8080', 'poster-1');
