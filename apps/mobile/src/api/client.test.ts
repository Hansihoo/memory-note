import { describe, expect, it, vi } from "vitest";
import { ReviewRating, StudyPlatform } from "@memory-note/core";

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

  it("maps today cards and submits mobile review payloads", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          summary: { dueCount: 1, newCount: 2, weakCount: 3, estimatedMinutes: 4, masteredCheckCount: 1 },
          cards: [
            {
              cardId: 9,
              memoryItemId: 8,
              legacyWordId: null,
              wordbookId: 7,
              cardType: "BASIC_KEY_TO_VALUE",
              prompt: "hello",
              answer: "안녕",
              status: "NEW",
              dueAt: "2026-05-05T00:00:00Z",
              lapses: 0,
              leechScore: 0,
              retrievability: 0.5
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          cardId: 9,
          memoryItemId: 8,
          legacyWordId: null,
          wordbookId: 7,
          rating: "GOOD",
          status: "REVIEW",
          dueAt: "2026-05-06T00:00:00Z",
          lastReviewedAt: "2026-05-05T00:00:00Z",
          intervalDays: 1,
          lapses: 0,
          streak: 1,
          leechScore: 0,
          reviewLogId: 3,
          deduplicated: false
        })
      );
    const api = createMobileApiClient({ baseUrl: "https://api.example.com", fetchImpl, getToken: () => "secret" });

    await expect(api.studyToday(5)).resolves.toEqual({
      summary: { dueCount: 1, newCount: 2, weakCount: 3, estimatedMinutes: 4, masteredCheckCount: 1 },
      cards: [
        {
          cardId: "9",
          memoryItemId: "8",
          legacyWordId: null,
          wordbookId: "7",
          cardType: "BASIC_KEY_TO_VALUE",
          prompt: "hello",
          answer: "안녕",
          status: "NEW",
          dueAt: "2026-05-05T00:00:00Z",
          lapses: 0,
          leechScore: 0,
          retrievability: 0.5
        }
      ]
    });
    await expect(
      api.reviewCard("9", { rating: ReviewRating.GOOD, platform: StudyPlatform.MOBILE, clientEventId: "mobile-9-GOOD-test" })
    ).resolves.toMatchObject({ cardId: "9", rating: "GOOD", status: "REVIEW", reviewLogId: "3" });
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://api.example.com/study/cards/9/review",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ rating: "GOOD", platform: "MOBILE", clientEventId: "mobile-9-GOOD-test" })
      })
    );
  });

  it("fetches mistakes and profile summary with null-safe long-term defaults", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          summary: { dueCount: 0, newCount: 0, weakCount: 1, estimatedMinutes: 1 },
          cards: [
            {
              cardId: 11,
              memoryItemId: 10,
              legacyWordId: 4,
              wordbookId: 2,
              cardType: "BASIC_VALUE_TO_KEY",
              prompt: "안녕",
              answer: "hello",
              status: "RELEARNING",
              dueAt: "2026-05-05T00:00:00Z",
              lapses: 2,
              leechScore: 4,
              retrievability: 0.2
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          cumulativeLearningDays: 5,
          todayStudiedCount: 3,
          memorizedWordCount: 9,
          masteredCount: 4,
          weakCardCount: 1,
          longTermReviewCount30d: 0,
          longTermCorrectCount30d: 0,
          longTermRecallRate30d: null,
          masteredLapseCount30d: 0,
          oldMasteredDueCount: 2
        })
      );
    const api = createMobileApiClient({ baseUrl: "https://api.example.com", fetchImpl });

    await expect(api.studyMistakes(10)).resolves.toMatchObject({
      summary: { weakCount: 1 },
      cards: [{ cardId: "11", legacyWordId: "4", lapses: 2 }]
    });
    await expect(api.profileSummary()).resolves.toEqual({
      cumulativeLearningDays: 5,
      todayStudiedCount: 3,
      memorizedWordCount: 9,
      masteredCount: 4,
      weakCardCount: 1,
      longTermReviewCount30d: 0,
      longTermCorrectCount30d: 0,
      longTermRecallRate30d: 0,
      masteredLapseCount30d: 0,
      oldMasteredDueCount: 2
    });
  });
});
