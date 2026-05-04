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
      if (url.includes("/sync/pull")) {
        return jsonResponse({ serverRevision: 0, wordbooks: [], words: [] });
      }
      if (url.includes("/study/today")) {
        return jsonResponse({
          summary: { dueCount: 0, newCount: 0, weakCount: 0, estimatedMinutes: 0 },
          cards: []
        });
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
        return jsonResponse({
          cumulativeLearningDays: 2,
          todayStudiedCount: 1,
          memorizedWordCount: 1,
          memorizedWords: [
            {
              wordId: 1,
              wordbookId: 1,
              wordbookName: "암기 노트 기본 단어",
              key: "airport",
              value: "공항",
              knownCount: 1,
              lastStudiedAt: "2026-05-04T00:00:00Z"
            }
          ],
          recentWordbooks: []
        });
      }
      return jsonResponse({});
    });

    render(<App />);
    expect(screen.queryByRole("button", { name: "Google로 시작하기" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "다시 학습하기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그인하기" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "가입" }));
    await userEvent.type(screen.getByLabelText("아이디"), "demo-learner");
    await userEvent.type(screen.getByLabelText("비밀번호"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "가입하기" }));

    expect(await screen.findByText("demo-learner")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "암기 노트 기본 단어" })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: /암기 노트 기본 문장/ })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "단어장 목록" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "암기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "읽어주기 켜기" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "프로필" }));
    expect(screen.getByRole("heading", { name: "외운 단어" })).toBeInTheDocument();
    expect(screen.getByText("airport")).toBeInTheDocument();
    expect(screen.getByText("공항")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "단어장 편집" }));
    await userEvent.click(screen.getByRole("button", { name: "파일 가져오기" }));
    expect(screen.getByRole("dialog", { name: "파일 가져오기" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Google Drive" }));
    expect(screen.getByRole("button", { name: "Google Drive에서 선택" })).toBeEnabled();
    expect(screen.getByText(/Google Cloud 설정 후 사용할 수 있습니다/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Google Drive에서 선택" }));
    expect(screen.getByText(/Google Drive를 열려면 Google Cloud OAuth\/API 설정이 필요합니다/)).toBeInTheDocument();
  });

  it("uses today queue cards and submits reviews with client event ids", async () => {
    localStorage.setItem("memory-assistant-token", "token-1");
    let reviewBody: { rating?: string; platform?: string; clientEventId?: string } | null = null;

    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/me")) {
        return jsonResponse({ id: 1, username: "demo-learner", displayName: "demo-learner" });
      }
      if (url.includes("/sync/pull")) {
        return jsonResponse({
          serverRevision: 1,
          wordbooks: [
            {
              id: 1,
              name: "Travel",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
              deletedAt: null,
              syncRevision: 1
            },
            {
              id: 2,
              name: "암기 노트 기본 문장",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
              deletedAt: null,
              syncRevision: 1
            }
          ],
          words: [
            {
              id: 10,
              wordbookId: 1,
              key: "departure",
              value: "출발",
              lastViewedAt: null,
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
              deletedAt: null,
              syncRevision: 1,
              itemType: "WORD"
            }
          ]
        });
      }
      if (url.includes("/study/today")) {
        return jsonResponse({
          summary: { dueCount: 0, newCount: 1, weakCount: 0, estimatedMinutes: 1 },
          cards: [
            {
              cardId: 99,
              memoryItemId: 50,
              legacyWordId: 10,
              wordbookId: 1,
              cardType: "BASIC_KEY_TO_VALUE",
              prompt: "departure",
              answer: "출발",
              status: "NEW",
              dueAt: "2026-05-04T00:00:00Z",
              lapses: 0,
              leechScore: 0
            }
          ]
        });
      }
      if (url.endsWith("/study/cards/99/review")) {
        reviewBody = JSON.parse(String(init?.body));
        return jsonResponse({
          cardId: 99,
          memoryItemId: 50,
          legacyWordId: 10,
          wordbookId: 1,
          rating: reviewBody?.rating,
          status: "RELEARNING",
          dueAt: "2026-05-04T00:10:00Z",
          lastReviewedAt: "2026-05-04T00:00:00Z",
          intervalDays: 0.0069,
          lapses: 1,
          streak: 0,
          leechScore: 2,
          reviewLogId: 77,
          deduplicated: false
        });
      }
      if (url.endsWith("/profile/summary")) {
        return jsonResponse({
          cumulativeLearningDays: 1,
          todayStudiedCount: 1,
          memorizedWordCount: 0,
          memorizedWords: [],
          recentWordbooks: []
        });
      }
      return jsonResponse({});
    });

    render(<App />);

    expect(await screen.findByText("departure")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "모름" }));
    expect(screen.getByText("출발")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "다음" }));

    const submittedReview = reviewBody as { rating?: string; platform?: string; clientEventId?: string } | null;
    expect(submittedReview).toMatchObject({ rating: "AGAIN", platform: "WEB" });
    expect(submittedReview?.clientEventId).toMatch(/^web-99-AGAIN-/);
  });
});
