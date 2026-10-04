import type {
  ActorId,
  ApiErrorBody,
  ApplicationView,
  ApplicationWithTask,
  Category,
  CreateTaskRequest,
  Profile,
  ProfileWrite,
  Review,
  TaskPublic,
} from "./types";

export class NovaError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface PublicAccount {
  id: string;
  role: string;
  display_name: string;
  volunteer_only: boolean;
}

export interface NovaClient {
  getHealth(): Promise<{ ok: true }>;
  listOpenTasks(query?: { category?: Category; city?: string }): Promise<{ tasks: TaskPublic[] }>;
  getTask(id: string): Promise<{ task: TaskPublic }>;
  createTask(body: CreateTaskRequest): Promise<{ task: TaskPublic }>;
  listMyTasks(): Promise<{ tasks: TaskPublic[] }>;
  listTaskApplications(taskId: string): Promise<{ applications: ApplicationView[] }>;
  acceptApplication(applicationId: string): Promise<{ task: TaskPublic }>;
  completeTask(taskId: string): Promise<{ task: TaskPublic }>;
  createReview(taskId: string, body: { stars: number; text: string }): Promise<{ review: Review }>;
  listReviews(taskId: string): Promise<{ reviews: Review[] }>;
  getMyProfile(): Promise<{ profile: Profile }>;
  putMyProfile(body: ProfileWrite): Promise<{ profile: Profile }>;
  applyToTask(taskId: string, body: { message: string }): Promise<{ application: ApplicationView }>;
  listMyApplications(): Promise<{ applications: ApplicationWithTask[] }>;
  register(body: { role: "worker" | "poster"; email: string; password: string; display_name: string; birth_date: string; guardian_email?: string }): Promise<{ user: PublicAccount }>;
  login(body: { email: string; password: string }): Promise<{ token: string; user: PublicAccount }>;
  logout(token: string): Promise<{ ok: true }>;
  me(token: string): Promise<{ user: PublicAccount }>;
  pay(taskId: string): Promise<{ payment: { task_id: string; pay_status: string; amount_bani: number; platform_fee_bani: number; worker_payout_bani: number; provider: string } }>;
  frameworkContract(): Promise<{ contract: { id: string; worker_id: string; kind: string; status: string } }>;
  signContract(id: string): Promise<{ contract: { id: string; status: string } }>;
  listEvents(): Promise<{ events: Array<{ id: string; title: string; city: string; starts_at: string; ends_at: string; slots: number; min_age: number; description: string }> }>;
}

export function createNovaClient(baseUrl: string, auth: ActorId | { token: string }): NovaClient {
  const root = baseUrl.replace(/\/$/, "");
  const token = typeof auth === "string" ? "" : auth.token;
  const actor = typeof auth === "string" ? auth : "";

  async function request<T>(path: string, init: RequestInit = {}, sendActor = true): Promise<T> {
    const headers = new Headers(init.headers);
    if (token && !headers.has("Authorization")) headers.set("Authorization", "Bearer " + token);
    else if (sendActor && actor) headers.set("X-Demo-Actor", actor);
    if (init.body) headers.set("Content-Type", "application/json");
    const response = await fetch(root + path, { ...init, headers });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const error = (data as ApiErrorBody).error;
      if (!error?.message) throw new NovaError(response.status, "bad_response", "Răspuns neașteptat de la server.");
      throw new NovaError(response.status, error.code, error.message);
    }
    return data as T;
  }

  return {
    getHealth: () => request("/health", {}, false),
    listOpenTasks: (query = {}) => {
      const params = new URLSearchParams();
      if (query.category) params.set("category", query.category);
      if (query.city) params.set("city", query.city);
      const suffix = params.size ? `?${params}` : "";
      return request(`/v1/tasks${suffix}`, {}, false);
    },
    getTask: (id) => request(`/v1/tasks/${id}`, {}, false),
    createTask: (body) => request("/v1/tasks", { method: "POST", body: JSON.stringify(body) }),
    listMyTasks: () => request("/v1/me/tasks"),
    listTaskApplications: (taskId) => request(`/v1/tasks/${taskId}/applications`),
    acceptApplication: (applicationId) =>
      request(`/v1/applications/${applicationId}/accept`, { method: "POST", body: "{}" }),
    completeTask: (taskId) => request(`/v1/tasks/${taskId}/complete`, { method: "POST", body: "{}" }),
    createReview: (taskId, body) =>
      request(`/v1/tasks/${taskId}/reviews`, { method: "POST", body: JSON.stringify(body) }),
    listReviews: (taskId) => request(`/v1/tasks/${taskId}/reviews`, {}, false),
    getMyProfile: () => request("/v1/profiles/me"),
    putMyProfile: (body) => request("/v1/profiles/me", { method: "PUT", body: JSON.stringify(body) }),
    applyToTask: (taskId, body) =>
      request(`/v1/tasks/${taskId}/applications`, { method: "POST", body: JSON.stringify(body) }),
    listMyApplications: () => request("/v1/me/applications"),
    register: (body) => request("/v1/auth/register", { method: "POST", body: JSON.stringify(body) }, false),
    login: (body) => request("/v1/auth/login", { method: "POST", body: JSON.stringify(body) }, false),
    logout: (token) => request("/v1/auth/logout", { method: "POST", body: "{}", headers: { Authorization: "Bearer " + token } }, false),
    me: (token) => request("/v1/me", { headers: { Authorization: "Bearer " + token } }, false),
    pay: (taskId) => request(`/v1/tasks/${taskId}/pay`, { method: "POST", body: "{}" }),
    frameworkContract: () => request("/v1/contracts/framework", { method: "POST", body: "{}" }),
    signContract: (id) => request(`/v1/contracts/${id}/sign`, { method: "POST", body: "{}" }),
    listEvents: () => request("/v1/events", {}, false),
  };
}

export function formatBani(amountBani: number): string {
  return `${(amountBani / 100).toFixed(2)} RON`;
}

export function toRfc3339(localValue: string): string {
  return `${localValue}:00+03:00`;
}

export function ronToBani(input: string): number {
  const normalized = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new NovaError(400, "invalid_input", "Suma trebuie să fie un număr întreg de bani între 0 și 500000.");
  }
  const [lei, frac = ""] = normalized.split(".");
  const bani = Number(lei) * 100 + Number(frac.padEnd(2, "0"));
  if (bani > 500000) {
    throw new NovaError(400, "invalid_input", "Suma trebuie să fie un număr întreg de bani între 0 și 500000.");
  }
  return bani;
}
