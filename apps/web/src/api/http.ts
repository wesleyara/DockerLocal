const BASE_URL = "/api";

export interface ApiErrorPayload {
  statusCode: number;
  message: string;
  canForce?: boolean;
}

export class ApiError extends Error {
  statusCode: number;
  canForce: boolean;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.statusCode = payload.statusCode;
    this.canForce = payload.canForce ?? false;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);

  if (method !== "GET") {
    headers.set("X-DockerLocal", "1");
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...init, method, headers });

  if (!res.ok) {
    let payload: ApiErrorPayload;
    try {
      payload = await res.json();
    } catch {
      payload = { statusCode: res.status, message: res.statusText };
    }
    throw new ApiError(payload);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export const http = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
