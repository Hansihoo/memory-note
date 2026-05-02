import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
      ...init
    })
  );
}

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("opens the home screen by pressing start", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/auth/login")) {
        return jsonResponse({ detail: "Invalid username or password" }, { status: 401 });
      }
      if (url.endsWith("/auth/register")) {
        return jsonResponse({ token: "token-1", user: { id: 1, username: "demo-learner" } }, { status: 201 });
      }
      if (url.endsWith("/wordbooks") && method === "GET") {
        return jsonResponse([]);
      }
      if (url.endsWith("/wordbooks")) {
        return jsonResponse({ id: 1, name: "기본 영어 단어장", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }, { status: 201 });
      }
      if (url.endsWith("/wordbooks/1/words/batch")) {
        return jsonResponse({
          words: [
            { id: 1, wordbookId: 1, key: "apple", value: "사과", lastViewedAt: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }
          ]
        });
      }
      if (url.endsWith("/profile/summary")) {
        return jsonResponse({ cumulativeLearningDays: 0, todayStudiedCount: 0, recentWordbooks: [] });
      }
      return jsonResponse({});
    });

    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "시작하기" }));

    expect(await screen.findByText("demo-learner")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "단어장 목록" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "암기" })).toBeInTheDocument();
  });
});
