import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, getCsrfToken } from "@/services/api";
import { jsonResponse } from "./utils";

afterEach(() => {
  vi.restoreAllMocks();
  document.cookie = "pdai_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});

describe("api client", () => {
  it("sends the CSRF cookie value as a header on unsafe requests only", async () => {
    document.cookie = "pdai_csrf=abc123";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse({ ok: true }));
    await api.post("/symptoms", { name: "x" });
    await api.get("/symptoms");
    const postHeaders = new Headers(fetchMock.mock.calls[0][1]!.headers);
    const getHeaders = new Headers(fetchMock.mock.calls[1][1]!.headers);
    expect(postHeaders.get("X-CSRF-Token")).toBe("abc123");
    expect(getHeaders.get("X-CSRF-Token")).toBeNull();
    expect(fetchMock.mock.calls[0][1]!.credentials).toBe("same-origin");
    expect(getCsrfToken()).toBe("abc123");
  });

  it("converts backend errors into ApiError with code and message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error: { code: "invalid_credentials", message: "Incorrect email or password.", details: null } }, 401));
    await expect(api.post("/auth/login", {})).rejects.toMatchObject({ status: 401, code: "invalid_credentials", message: "Incorrect email or password." });
  });

  it("surfaces the first validation message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: { code: "validation_error", message: "Some fields are invalid.", details: [{ field: "value", message: "Value error, Value 900 bpm is outside the accepted range" }] } }, 422));
    const err = (await api.post("/measurements", {}).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("Value 900 bpm is outside the accepted range");
  });

  it("reports network failures clearly", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.get("/dashboard")).rejects.toMatchObject({ code: "network_error" });
  });

  it("never writes to localStorage or sessionStorage", async () => {
    const ls = vi.spyOn(Storage.prototype, "setItem");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ id: "1" }));
    await api.post("/auth/login", { email: "a@b.co", password: "x" });
    expect(ls).not.toHaveBeenCalled();
  });
});
