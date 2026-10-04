import { NovaError } from '../api/client';
import { apiBaseUrl } from '../api/instance';

export type AdminUser = {
  id: string;
  role: string;
  display_name: string;
  email: string;
  status: string;
  volunteer_only: boolean;
};

export type AdminLog = {
  id: string;
  actor_id: string;
  action: string;
  target: string;
  detail: string;
  created_at: string;
};

export type AdminDispute = {
  id: string;
  task_id: string;
  opener_id: string;
  reason: string;
  status: string;
  created_at: string;
};

type Json = Record<string, unknown>;

function errorFrom(data: unknown): { code: string; message: string } {
  if (!data || typeof data !== 'object' || !('error' in data)) {
    return { code: 'bad_response', message: 'Răspuns neașteptat de la server.' };
  }
  const error = data.error;
  if (!error || typeof error !== 'object') {
    return { code: 'bad_response', message: 'Răspuns neașteptat de la server.' };
  }
  const code = 'code' in error && typeof error.code === 'string' ? error.code : 'bad_response';
  const message = 'message' in error && typeof error.message === 'string' ? error.message : 'Răspuns neașteptat de la server.';
  return { code, message };
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', 'Bearer ' + token);
  if (init.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(apiBaseUrl().replace(/\/$/, '') + path, { ...init, headers });
  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = errorFrom(data);
    throw new NovaError(response.status, error.code, error.message);
  }
  return data as T;
}

export const adminApi = {
  login: (email: string, password: string) =>
    call<{ token: string; user: { id: string; role: string; display_name: string } }>('', '/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: (token: string) => call<{ ok: true }>(token, '/v1/auth/logout', { method: 'POST', body: '{}' }),
  me: (token: string) => call<{ user: { id: string; role: string; display_name: string } }>(token, '/v1/me'),
  users: (token: string) => call<{ users: AdminUser[] }>(token, '/v1/admin/users'),
  setUserStatus: (token: string, id: string, status: 'active' | 'suspended') =>
    call<{ ok: true }>(token, `/v1/admin/users/${id}/${status === 'suspended' ? 'suspend' : 'activate'}`, { method: 'POST', body: '{}' }),
  tasks: (token: string) => call<{ tasks: Json[] }>(token, '/v1/admin/tasks'),
  hideTask: (token: string, id: string) => call(token, `/v1/admin/tasks/${id}/hide`, { method: 'POST', body: '{}' }),
  unhideTask: (token: string, id: string) => call(token, `/v1/admin/tasks/${id}/unhide`, { method: 'POST', body: '{}' }),
  disputes: (token: string) => call<{ disputes: AdminDispute[] }>(token, '/v1/admin/disputes'),
  resolveDispute: (token: string, id: string, result: string) =>
    call(token, `/v1/admin/disputes/${id}/resolve`, { method: 'POST', body: JSON.stringify({ result, worker_bani: 0, poster_bani: 0 }) }),
  ledger: (token: string) => call<{ entries: Json[] }>(token, '/v1/admin/ledger'),
  partners: (token: string) => call<{ partners: Json[] }>(token, '/v1/admin/partners'),
  activatePartner: (token: string, id: string) => call(token, `/v1/admin/partners/${id}/activate`, { method: 'POST', body: '{}' }),
  events: (token: string) => call<{ events: Json[] }>(token, '/v1/events'),
  logs: (token: string) => call<{ logs: AdminLog[] }>(token, '/v1/admin/logs'),
};
