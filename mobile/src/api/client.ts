import type {
  ChatMessage,
  Conversation,
  MessagePage,
  IdentityVerification,
  IdentityProof,
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
  phone_number: string;
  id: string;
  role: string;
  display_name: string;
  volunteer_only: boolean;
}

export interface NovaClient {
  updatePhone(phone_number: string): Promise<{ user: PublicAccount }>;
  listConversations(): Promise<{ conversations: Conversation[] }>;
  startTaskConversation(taskId: string, participant_id?: string): Promise<{ conversation: Conversation }>;
  listMessages(id: string, after?: number, before?: number): Promise<MessagePage>;
  sendMessage(id: string, text: string): Promise<{ message: ChatMessage }>;
  getHealth(): Promise<{ ok: true }>;
  listOpenTasks(query?: { category?: Category; city?: string; sector?: string; lat?: number; lng?: number; radius_km?: number }): Promise<{ tasks: TaskPublic[] }>;
  searchTasks(query?: { kind?: string; from?: string; to?: string; city?: string }): Promise<{ tasks: TaskPublic[] }>;
  getTask(id: string): Promise<{ task: TaskPublic }>;
  createTask(body: CreateTaskRequest): Promise<{ task: TaskPublic }>;
  listMyTasks(): Promise<{ tasks: TaskPublic[] }>;
  listTaskApplications(taskId: string): Promise<{ applications: ApplicationView[] }>;
  acceptApplication(applicationId: string): Promise<{ task: TaskPublic }>;
  completeTask(taskId: string): Promise<{ task: TaskPublic }>;
  updateTask(taskId: string, body: CreateTaskRequest): Promise<{ task: TaskPublic }>;
  deleteTask(taskId: string): Promise<{ ok: boolean }>;
  cancelTask(taskId: string): Promise<{ task: TaskPublic }>;
  openDispute(taskId: string, body: { reason: string }): Promise<{ dispute: { id: string; status: "open" } }>;
  createReview(taskId: string, body: { stars: number; text: string }): Promise<{ review: Review }>;
  listReviews(taskId: string): Promise<{ reviews: Review[] }>;
  getMyProfile(): Promise<{ profile: Profile }>;
  putMyProfile(body: ProfileWrite): Promise<{ profile: Profile }>;
  applyToTask(taskId: string, body: { message: string }): Promise<{ application: ApplicationView }>;
  listMyApplications(): Promise<{ applications: ApplicationWithTask[] }>;
  startIdentity(body: { email: string; kind: "ci" | "cei" }): Promise<{ verification: IdentityVerification }>;
  uploadIdentityFile(id: string, body: { slot: "ci_front" | "ci_back" | "ci_scan_text" | "cei_front" | "cei_back" | "cei_pdf" | "selfie" | "selfie_video"; content_type: string; content_base64: string }): Promise<{ file: { id: string; slot: string; sha256: string } }>;
  completeIdentity(id: string): Promise<{ verification: IdentityVerification; proof: IdentityProof | null }>;
  register(body: { role: "worker" | "poster"; email: string; password: string; display_name: string; birth_date?: string; identity_proof?: string; guardian_email?: string; phone_number?: string }): Promise<{ user: PublicAccount }>;
  login(body: { email: string; password: string }): Promise<{ token: string; user: PublicAccount }>;
  logout(token: string): Promise<{ ok: true }>;
  me(token: string): Promise<{ user: PublicAccount }>;
  pay(taskId: string): Promise<{ payment: { task_id: string; pay_status: string; amount_bani: number; platform_fee_bani: number; worker_payout_bani: number; provider: string } }>;
  frameworkContract(): Promise<{ contract: { id: string; worker_id: string; kind: string; status: string } }>;
  signContract(id: string): Promise<{ contract: { id: string; status: string } }>;
  listAdminTasks(): Promise<{ tasks: TaskPublic[] }>;
  hideTask(taskId: string): Promise<{ task: TaskPublic }>;
  resetDemo(): Promise<{ ok: true }>;
  getReputation(userId: string): Promise<{ count: number; average: number }>;
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
    updatePhone: (phone_number) => request("/v1/me/phone", { method: "PUT", body: JSON.stringify({ phone_number }) }),
    listConversations: () => request("/v1/me/conversations"),
    startTaskConversation: (taskId, participant_id) => request(`/v1/tasks/${encodeURIComponent(taskId)}/conversations`, { method: "POST", body: JSON.stringify(participant_id ? { participant_id } : {}) }),
    listMessages: (id, after, before) => request(`/v1/conversations/${encodeURIComponent(id)}/messages${after !== undefined ? `?after=${after}` : before !== undefined ? `?before=${before}` : ""}`),
    sendMessage: (id, text) => request(`/v1/conversations/${encodeURIComponent(id)}/messages`, { method: "POST", body: JSON.stringify({ text }) }),
    getHealth: () => request("/health", {}, false),
    listOpenTasks: (query = {}) => {
      const params = new URLSearchParams();
      if (query.category) params.set("category", query.category);
      if (query.city) params.set("city", query.city);
      if (query.sector) params.set("sector", query.sector);
      if (query.lat !== undefined) params.set("lat", String(query.lat));
      if (query.lng !== undefined) params.set("lng", String(query.lng));
      if (query.radius_km !== undefined) params.set("radius_km", String(query.radius_km));
      const suffix = params.size ? `?${params}` : "";
      return request(`/v1/tasks${suffix}`, {}, false);
    },
    searchTasks: (query = {}) => {
      const params = new URLSearchParams();
      if (query.kind) params.set("kind", query.kind);
      if (query.from) params.set("from", query.from);
      if (query.to) params.set("to", query.to);
      if (query.city) params.set("city", query.city);
      const suffix = params.size ? `?${params}` : "";
      return request(`/v1/tasks/search${suffix}`);
    },
    getTask: (id) => request(`/v1/tasks/${id}`, {}, false),
    createTask: (body) => request("/v1/tasks", { method: "POST", body: JSON.stringify(body) }),
    listMyTasks: () => request("/v1/me/tasks"),
    listTaskApplications: (taskId) => request(`/v1/tasks/${taskId}/applications`),
    acceptApplication: (applicationId) =>
      request(`/v1/applications/${applicationId}/accept`, { method: "POST", body: "{}" }),
    completeTask: (taskId) => request(`/v1/tasks/${taskId}/complete`, { method: "POST", body: "{}" }),
    updateTask: (taskId, body) => request(`/v1/tasks/${encodeURIComponent(taskId)}`, { method: "PUT", body: JSON.stringify(body) }),
    deleteTask: (taskId) => request(`/v1/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" }),
    cancelTask: (taskId) => request(`/v1/tasks/${taskId}/cancel`, { method: "POST", body: "{}" }),
    openDispute: (taskId, body) => request(`/v1/tasks/${taskId}/dispute`, { method: "POST", body: JSON.stringify(body) }),
    createReview: (taskId, body) =>
      request(`/v1/tasks/${taskId}/reviews`, { method: "POST", body: JSON.stringify(body) }),
    listReviews: (taskId) => request(`/v1/tasks/${taskId}/reviews`, {}, false),
    getMyProfile: () => request("/v1/profiles/me"),
    putMyProfile: (body) => request("/v1/profiles/me", { method: "PUT", body: JSON.stringify(body) }),
    applyToTask: (taskId, body) =>
      request(`/v1/tasks/${taskId}/applications`, { method: "POST", body: JSON.stringify(body) }),
    listMyApplications: () => request("/v1/me/applications"),
    startIdentity: (body) => request("/v1/auth/identity", { method: "POST", body: JSON.stringify(body) }, false),
    uploadIdentityFile: (id, body) => request(`/v1/auth/identity/${id}/files`, { method: "POST", body: JSON.stringify(body) }, false),
    completeIdentity: (id) => request(`/v1/auth/identity/${id}/complete`, { method: "POST", body: "{}" }, false),
    register: (body) => request("/v1/auth/register", { method: "POST", body: JSON.stringify(body) }, false),
    login: (body) => request("/v1/auth/login", { method: "POST", body: JSON.stringify(body) }, false),
    logout: (token) => request("/v1/auth/logout", { method: "POST", body: "{}", headers: { Authorization: "Bearer " + token } }, false),
    me: (token) => request("/v1/me", { headers: { Authorization: "Bearer " + token } }, false),
    pay: (taskId) => request(`/v1/tasks/${taskId}/pay`, { method: "POST", body: "{}" }),
    frameworkContract: () => request("/v1/contracts/framework", { method: "POST", body: "{}" }),
    signContract: (id) => request(`/v1/contracts/${id}/sign`, { method: "POST", body: "{}" }),
    listAdminTasks: () => request("/v1/admin/tasks"),
    hideTask: (taskId) => request(`/v1/admin/tasks/${taskId}/hide`, { method: "POST", body: "{}" }),
    resetDemo: () => request("/v1/demo/reset", { method: "POST", body: "{}" }),
    getReputation: (userId) => request(`/v1/users/${userId}/reputation`, {}, false),
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
