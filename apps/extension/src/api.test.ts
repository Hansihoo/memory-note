import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ExtensionAuthMissingError,
  loadServerStudyCards,
  ratingFromQuizMark,
  submitServerReview,
} from "./api";
import type { ExtensionAuth } from "./auth";

const auth: ExtensionAuth = {
  token: "token-1",
  apiBaseUrl: "http://localhost:8000",
  updatedAt: 1234,
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
      ...init,
    }),
  );
}

describe("extension api", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires a connected token before loading server cards", async () => {
    await expect(loadServerStudyCards(5, Promise.resolve(null))).rejects.toBeInstanceOf(
      ExtensionAuthMissingError,
    );
  });

  it("loads cards from study today response cards", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      await jsonResponse({
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
            leechScore: 0,
          },
        ],
      }),
    );

    await expect(loadServerStudyCards(5, Promise.resolve(auth))).resolves.toEqual([
      {
        id: "99",
        prompt: "departure",
        answer: "출발",
        source: "server:1:50:BASIC_KEY_TO_VALUE",
      },
    ]);
    expect(globalThis.fetch).toHaveBeenCalledWith("http://localhost:8000/study/today?limit=5", {
      headers: { Authorization: "Bearer token-1" },
    });
  });

  it("maps O/X marks to review ratings and includes client event ids", async () => {
    let body: { rating?: string; platform?: string; clientEventId?: string } | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      body = JSON.parse(String(init?.body));
      return jsonResponse({});
    });

    await submitServerReview("99", "know", Promise.resolve(auth));
    expect(ratingFromQuizMark("know")).toBe("GOOD");
    expect(ratingFromQuizMark("unknown")).toBe("AGAIN");
    const submittedReview = body as { rating?: string; platform?: string; clientEventId?: string } | null;
    expect(submittedReview).toMatchObject({ rating: "GOOD", platform: "EXTENSION" });
    expect(submittedReview?.clientEventId).toMatch(/^extension-99-know-/);
  });
});
