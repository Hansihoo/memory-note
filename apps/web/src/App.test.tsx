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
    let nextWordbookId = 1;
    const batchRequests: Array<{ wordbookId: number; words: Array<{ key: string; value: string }> }> = [];

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
        const body = JSON.parse(String(init?.body));
        return jsonResponse({ id: nextWordbookId++, name: body.name, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }, { status: 201 });
      }
      const batchMatch = url.match(/\/wordbooks\/(\d+)\/words\/batch$/);
      if (batchMatch) {
        const wordbookId = Number(batchMatch[1]);
        const body = JSON.parse(String(init?.body));
        batchRequests.push({ wordbookId, words: body.words });
        return jsonResponse({
          words: body.words.map((word: { key: string; value: string }, index: number) => ({
            id: index + 1,
            wordbookId,
            key: word.key,
            value: word.value,
            lastViewedAt: null,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z"
          }))
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
    expect(await screen.findByRole("heading", { name: "해외 여행 필수 영단어" })).toBeInTheDocument();
    expect(batchRequests[0].words).toHaveLength(100);
    expect(batchRequests[0].words[0]).toEqual({ key: "airport", value: "공항" });
    expect(batchRequests[0].words[99]).toEqual({ key: "information", value: "안내소 / 정보" });
    expect(batchRequests[1].words).toHaveLength(100);
    expect(batchRequests[1].words[0]).toEqual({
      key: "Could you tell me where the check-in counter is?",
      value: "체크인 카운터가 어디인지 알려주실 수 있나요?"
    });
    expect(batchRequests[1].words[99]).toEqual({
      key: "Could you help me make an international call?",
      value: "국제전화를 거는 것을 도와주실 수 있나요?"
    });
    expect(screen.getByRole("button", { name: /해외여행 필수 영어문장/ })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "단어장 목록" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "암기" })).toBeInTheDocument();
  });
});
