import { describe, expect, it, vi } from "vitest";

import { createMobileApiClient } from "./client";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init
  });
}

describe("createMobileApiClient", () => {
  it("normalizes base URL and maps login token responses", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        token: "token-1",
        user: { id: 7, username: "theo", displayName: null }
      })
    );
    const api = createMobileApiClient({ baseUrl: "http://localhost:8000/", fetchImpl });

    await expect(api.login({ username: "theo", password: "password123" })).resolves.toEqual({
      token: "token-1",
      user: { id: "7", username: "theo", displayName: "theo" }
    });
    expect(api.getApiBaseUrl()).toBe("http://localhost:8000");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:8000/auth/login",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sends bearer token for authenticated requests", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 3,
        username: "mobile",
        displayName: "Mobile"
      })
    );
    const api = createMobileApiClient({ baseUrl: "https://api.example.com", fetchImpl, getToken: () => "secret" });

    await expect(api.me()).resolves.toEqual({ id: "3", username: "mobile", displayName: "Mobile" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.com/me",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer secret" })
      })
    );
  });
});
