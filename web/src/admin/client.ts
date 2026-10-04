import { NovaError } from '../api/client';
import { apiBaseUrl } from '../api/instance';
import type { ApplicationView, CreateTaskRequest, Profile, Review, TaskPublic } from '../api/types';

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

export type AdminNote = {
  id: string;
  target: string;
  author_id: string;
  author_name: string;
  text: string;
  created_at: string;
};

export type LedgerEntry = {
  id: string;
  task_id: string;
  account: string;
  direction: string;
  amount_bani: number;
  created_at: string;
};

export type Partner = { id: string; name: string; status: string };

export type AdminEvent = {
  id: string;
  title: string;
  city: string;
  starts_at: string;
  ends_at: string;
  slots: number;
  min_age: number;
  description: string;
  attendees: number;
  checked_in: number;
  completed: number;
};

export type AdminApplication = {
  id: string;
  task_id: string;
  task_title: string;
  worker_id: string;
  worker_name: string;
  message: string;
  status: string;
  created_at: string;
};

export type AdminReview = {
  id: string;
  task_id: string;
  task_title: string;
  author_id: string;
  author_name: string;
  subject_id: string;
  subject_name: string;
  stars: number;
  text: string;
  created_at: string;
};

export type IdentitySession = {
  id: string;
  email: string;
  kind: string;
  status: string;
  created_at: string;
  expires_at: string;
  checks: Record<string, string>;
  provider: string;
};

export type DailyPoint = {
  date: string;
  tasks: number;
  volume_bani: number;
  applications: number;
  signups: number;
  messages: number;
};

export type AdminStats = {
  users_by_role: Record<string, number>;
  users_by_status: Record<string, number>;
  tasks_by_status: Record<string, number>;
  tasks_by_category: Record<string, number>;
  tasks_by_pay_status: Record<string, number>;
  applications_by_status: Record<string, number>;
  disputes_by_status: Record<string, number>;
  identity_by_status: Record<string, number>;
  money: { listed_bani: number; escrow_bani: number; released_bani: number; refunded_bani: number; platform_bani: number; worker_bani: number };
  reviews: { count: number; average: number; stars: Record<string, number> };
  chat: { conversations: number; messages: number };
  events: number;
  attendances: number;
  active_sessions: number;
  cities: Array<{ city: string; tasks: number; volume_bani: number }>;
  daily: DailyPoint[];
};

export type AdminSystem = {
  go_version: string;
  started_at: string;
  uptime_seconds: number;
  demo_mode: boolean;
  identity_provider: boolean;
  db_bytes: number;
  goroutines: number;
  memory_bytes: number;
  tables: Record<string, number>;
  server_time: string;
};

export type AdminUserDetail = {
  user: AdminUser & { phone_number: string; birth_date: string; guardian_email: string; created_at: string; identity_verified: boolean };
  profile: Profile | null;
  tasks_posted: TaskPublic[];
  tasks_assigned: TaskPublic[];
  applications: ApplicationView[];
  reviews_about: Review[];
  reviews_by: Review[];
  reputation: { count: number; average: number };
  active_sessions: number;
  notes: AdminNote[];
  logs: AdminLog[];
};

export type AdminTaskDetail = {
  task: TaskPublic;
  kind: string;
  pay_status: string;
  applications: ApplicationView[];
  reviews: Review[];
  ledger: LedgerEntry[];
  disputes: AdminDispute[];
  payment: null | { provider: string; status: string; amount_bani: number; platform_fee_bani: number; worker_payout_bani: number };
  conversations: number;
  notes: AdminNote[];
  logs: AdminLog[];
};

export type NewEvent = { title: string; city: string; starts_at: string; ends_at: string; slots: number; min_age: number; description: string };

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

const post = <T = { ok: true }>(token: string, path: string, body: unknown = {}) =>
  call<T>(token, path, { method: 'POST', body: JSON.stringify(body) });
const id = (value: string) => encodeURIComponent(value);

export const adminApi = {
  login: (email: string, password: string) =>
    call<{ token: string; user: { id: string; role: string; display_name: string } }>('', '/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: (token: string) => post(token, '/v1/auth/logout'),
  me: (token: string) => call<{ user: { id: string; role: string; display_name: string } }>(token, '/v1/me'),
  stats: (token: string, days: 14 | 30 = 14) => call<{ stats: AdminStats }>(token, `/v1/admin/stats?days=${days}`),
  system: (token: string) => call<{ system: AdminSystem }>(token, '/v1/admin/system'),
  users: (token: string) => call<{ users: AdminUser[] }>(token, '/v1/admin/users'),
  user: (token: string, userId: string) => call<AdminUserDetail>(token, `/v1/admin/users/${id(userId)}`),
  setUserStatus: (token: string, userId: string, status: 'active' | 'suspended') =>
    post(token, `/v1/admin/users/${id(userId)}/${status === 'suspended' ? 'suspend' : 'activate'}`),
  revokeSessions: (token: string, userId: string) => post<{ ok: true; revoked: number }>(token, `/v1/admin/users/${id(userId)}/revoke-sessions`),
  updateUser: (token: string, userId: string, patch: Partial<{ display_name: string; email: string; phone_number: string; birth_date: string; guardian_email: string; role: string; identity_verified: boolean }>) =>
    call<AdminUserDetail>(token, `/v1/admin/users/${id(userId)}`, { method: 'PUT', body: JSON.stringify(patch) }),
  updateProfile: (token: string, userId: string, profile: { skills: string[]; city: string; availability: string; bio: string }) =>
    call<AdminUserDetail>(token, `/v1/admin/users/${id(userId)}/profile`, { method: 'PUT', body: JSON.stringify(profile) }),
  setUserPassword: (token: string, userId: string, password: string) => post(token, `/v1/admin/users/${id(userId)}/password`, { password }),
  createUser: (token: string, body: { role: string; email: string; password: string; display_name: string; phone_number: string; birth_date: string; guardian_email: string; identity_verified: boolean }) =>
    call<{ user: AdminUser & { phone_number: string; birth_date: string; identity_verified: boolean } }>(token, '/v1/admin/users', { method: 'POST', body: JSON.stringify(body) }),
  createTask: (token: string, body: CreateTaskRequest & { poster_id: string }) =>
    call<{ task: TaskPublic }>(token, '/v1/admin/tasks', { method: 'POST', body: JSON.stringify(body) }),
  updateTask: (token: string, taskId: string, body: CreateTaskRequest) =>
    call<{ task: TaskPublic }>(token, `/v1/admin/tasks/${id(taskId)}`, { method: 'PUT', body: JSON.stringify(body) }),
  assignTask: (token: string, taskId: string, workerId: string) =>
    call<{ task: TaskPublic }>(token, `/v1/admin/tasks/${id(taskId)}/assign`, { method: 'POST', body: JSON.stringify({ worker_id: workerId }) }),
  acceptApplication: (token: string, applicationId: string) => post<{ task: TaskPublic }>(token, `/v1/admin/applications/${id(applicationId)}/accept`),
  tasks: (token: string) => call<{ tasks: TaskPublic[] }>(token, '/v1/admin/tasks'),
  task: (token: string, taskId: string) => call<AdminTaskDetail>(token, `/v1/admin/tasks/${id(taskId)}`),
  hideTask: (token: string, taskId: string) => post(token, `/v1/admin/tasks/${id(taskId)}/hide`),
  unhideTask: (token: string, taskId: string) => post(token, `/v1/admin/tasks/${id(taskId)}/unhide`),
  applications: (token: string) => call<{ applications: AdminApplication[] }>(token, '/v1/admin/applications'),
  reviews: (token: string) => call<{ reviews: AdminReview[] }>(token, '/v1/admin/reviews'),
  removeReview: (token: string, reviewId: string) => post(token, `/v1/admin/reviews/${id(reviewId)}/remove`),
  disputes: (token: string) => call<{ disputes: AdminDispute[] }>(token, '/v1/admin/disputes'),
  resolveDispute: (token: string, disputeId: string, result: 'release' | 'refund' | 'split', workerBani = 0, posterBani = 0) =>
    post(token, `/v1/admin/disputes/${id(disputeId)}/resolve`, { result, worker_bani: workerBani, poster_bani: posterBani }),
  ledger: (token: string) => call<{ entries: LedgerEntry[] }>(token, '/v1/admin/ledger'),
  partners: (token: string) => call<{ partners: Partner[] }>(token, '/v1/admin/partners'),
  createPartner: (token: string, name: string) => post<{ partner: Partner }>(token, '/v1/admin/partners', { name }),
  activatePartner: (token: string, partnerId: string) => post(token, `/v1/admin/partners/${id(partnerId)}/activate`),
  pausePartner: (token: string, partnerId: string) => post(token, `/v1/admin/partners/${id(partnerId)}/pause`),
  events: (token: string) => call<{ events: AdminEvent[] }>(token, '/v1/admin/events'),
  createEvent: (token: string, body: NewEvent) => post<{ event: NewEvent & { id: string } }>(token, '/v1/events', body),
  deleteEvent: (token: string, eventId: string) => post(token, `/v1/admin/events/${id(eventId)}/delete`),
  identity: (token: string) => call<{ sessions: IdentitySession[] }>(token, '/v1/admin/identity'),
  notes: (token: string, target: string) => call<{ notes: AdminNote[] }>(token, `/v1/admin/notes?target=${id(target)}`),
  addNote: (token: string, target: string, text: string) => post<{ note: AdminNote }>(token, '/v1/admin/notes', { target, text }),
  logs: (token: string) => call<{ logs: AdminLog[] }>(token, '/v1/admin/logs'),
};
