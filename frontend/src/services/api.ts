/**
 * Fetch-based API client.
 * - Session is an HttpOnly cookie set by the backend (never readable from JS).
 * - Unsafe requests echo the readable `pdai_csrf` cookie in the X-CSRF-Token header (double-submit).
 * - No tokens or API keys are ever stored in localStorage/sessionStorage.
 */
export const API_BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  /** Field-level validation messages, if any. */
  get fieldErrors(): { field: string; message: string }[] {
    return Array.isArray(this.details) ? (this.details as { field: string; message: string }[]) : [];
  }
}

export function getCsrfToken(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)pdai_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export async function parseError(res: Response): Promise<ApiError> {
  let code = "http_error";
  let message = `Request failed (${res.status}).`;
  let details: unknown;
  try {
    const body = await res.json();
    if (body?.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details;
      if (Array.isArray(details) && details.length && code === "validation_error") {
        const first = details[0] as { field?: string; message?: string };
        message = first.message?.replace(/^Value error, /, "") ?? message;
      }
    }
  } catch {
    /* non-JSON error */
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    if (code === "http_error") message = "The Personal Doctor AI backend is not reachable. Is it running?";
  }
  return new ApiError(res.status, code, message, details);
}

export async function rawRequest(method: Method, path: string, body?: unknown, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (body !== undefined && !(body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (method !== "GET") {
    const csrf = getCsrfToken();
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      method,
      headers,
      credentials: "same-origin",
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network_error", "Cannot reach the Personal Doctor AI backend. Check that the app is running.");
  }
  if (!res.ok) {
    const err = await parseError(res);
    if (res.status === 401 && onUnauthorized && !path.startsWith("/auth/login")) onUnauthorized();
    throw err;
  }
  return res;
}

export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const res = await rawRequest(method, path, body);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(p: string) => request<T>("GET", p),
  post: <T>(p: string, b?: unknown) => request<T>("POST", p, b ?? {}),
  put: <T>(p: string, b?: unknown) => request<T>("PUT", p, b ?? {}),
  patch: <T>(p: string, b?: unknown) => request<T>("PATCH", p, b ?? {}),
  del: <T>(p: string, b?: unknown) => request<T>("DELETE", p, b),
};

/** Download a file from an authenticated endpoint without exposing anything in the URL. */
export async function downloadFile(path: string, fallbackName: string) {
  const res = await rawRequest("GET", path);
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const name = /filename="?([^"]+)"?/.exec(cd)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Server-Sent Events over POST (fetch streaming). */
export async function streamRequest(
  path: string,
  body: unknown,
  handlers: { onDelta: (t: string) => void; onDone: (data: any) => void; onError: (e: ApiError) => void },
  signal?: AbortSignal,
) {
  const res = await rawRequest("POST", path, body, { signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const event = /^event: (.*)$/m.exec(chunk)?.[1];
      const dataLine = /^data: (.*)$/m.exec(chunk)?.[1];
      if (!event || !dataLine) continue;
      const data = JSON.parse(dataLine);
      if (event === "delta") handlers.onDelta(data.text);
      else if (event === "done") handlers.onDone(data);
      else if (event === "error") handlers.onError(new ApiError(502, data.code, data.message));
    }
  }
}
