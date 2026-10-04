import { Platform } from "react-native";
import type {
  ApplicationView,
  ApplicationWithTask,
  Category,
  Profile,
  ProfileWrite,
  TaskPublic,
} from "./types";

const defaultBase =
  Platform.OS === "android" ? "http://10.0.2.2:8080" : "http://127.0.0.1:8080";
const baseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL || defaultBase).replace(
  /\/$/,
  "",
);
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}
async function request<T>(
  path: string,
  method = "GET",
  body?: object,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          "X-Demo-Actor": "worker-1",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error(
        "Nu se poate conecta la API. Verifică adresa și conexiunea.",
      );
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error("Răspuns neașteptat de la server.");
    }
    if (!response.ok) {
      const error = (data as { error?: { code?: unknown; message?: unknown } })
        ?.error;
      if (typeof error?.code === "string" && typeof error.message === "string")
        throw new ApiError(error.message, error.code, response.status);
      throw new Error("Răspuns neașteptat de la server.");
    }
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}

export const listTasks = (category?: Category, city?: string) =>
  request<{ tasks: TaskPublic[] }>(
    `/v1/tasks?${new URLSearchParams({ ...(category ? { category } : {}), ...(city ? { city } : {}) }).toString()}`,
  );
export const getTask = (id: string) =>
  request<{ task: TaskPublic }>(`/v1/tasks/${encodeURIComponent(id)}`);
export const getProfile = () =>
  request<{ profile: Profile }>("/v1/profiles/me");
export const saveProfile = (profile: ProfileWrite) =>
  request<{ profile: Profile }>("/v1/profiles/me", "PUT", profile);
export const applyToTask = (id: string, message: string) =>
  request<{ application: ApplicationView }>(
    `/v1/tasks/${encodeURIComponent(id)}/applications`,
    "POST",
    { message },
  );
export const listMyApplications = () =>
  request<{ applications: ApplicationWithTask[] }>("/v1/me/applications");
