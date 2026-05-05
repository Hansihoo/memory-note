import { ReviewRating, StudyPlatform, type PendingReviewEvent } from "@memory-note/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_PENDING_REVIEW_FLUSH_BATCH,
  PENDING_REVIEW_QUEUE_KEY,
  enqueuePendingReview,
  flushPendingReviews,
  loadPendingQueue,
  type PendingReviewStorage
} from "./pendingReviewQueue";

function createMemoryStorage(): PendingReviewStorage & { state: Record<string, string> } {
  const state: Record<string, string> = {};
  return {
    state,
    async getItem(key: string) {
      return state[key] ?? null;
    },
    async setItem(key: string, value: string) {
      state[key] = value;
    }
  };
}

function event(id: string, overrides: Partial<PendingReviewEvent> = {}): PendingReviewEvent {
  return {
    cardId: id,
    rating: ReviewRating.GOOD,
    platform: StudyPlatform.MOBILE,
    clientEventId: `e-${id}`,
    reviewedAt: new Date().toISOString(),
    attemptCount: 0,
    lastAttemptAt: null,
    ...overrides
  };
}

describe("mobile pending review queue", () => {
  let storage: ReturnType<typeof createMemoryStorage>;
  let api: { reviewCard: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    storage = createMemoryStorage();
    api = { reviewCard: vi.fn().mockResolvedValue({}) };
  });

  it("queues failed review events and preserves clientEventId", async () => {
    await enqueuePendingReview(event("1"), storage);

    expect(await loadPendingQueue(storage)).toMatchObject([{ cardId: "1", clientEventId: "e-1" }]);
  });

  it("successful retry removes event", async () => {
    await enqueuePendingReview(event("1"), storage);

    await flushPendingReviews(api as never, storage);

    expect(await loadPendingQueue(storage)).toHaveLength(0);
    expect(api.reviewCard).toHaveBeenCalledWith("1", expect.objectContaining({ clientEventId: "e-1" }));
  });

  it("401 preserves queue and requires login", async () => {
    api.reviewCard.mockRejectedValueOnce({ status: 401 });
    await enqueuePendingReview(event("1"), storage);

    await expect(flushPendingReviews(api as never, storage)).resolves.toBe("auth_required");
    expect(await loadPendingQueue(storage)).toHaveLength(1);
  });

  it("409 removes non-retryable event", async () => {
    api.reviewCard.mockRejectedValueOnce({ status: 409 });
    await enqueuePendingReview(event("1"), storage);

    await flushPendingReviews(api as never, storage);

    expect(await loadPendingQueue(storage)).toHaveLength(0);
  });

  it("network failure keeps event and increments attemptCount", async () => {
    api.reviewCard.mockRejectedValueOnce(new Error("network"));
    await enqueuePendingReview(event("1"), storage);

    await flushPendingReviews(api as never, storage);

    const queue = await loadPendingQueue(storage);
    expect(queue).toHaveLength(1);
    expect(queue[0].attemptCount).toBe(1);
    expect(queue[0].lastAttemptAt).toEqual(expect.any(String));
  });

  it("caps queue, prunes old events, and flushes at most 20 oldest events", async () => {
    const now = Date.now();
    storage.state[PENDING_REVIEW_QUEUE_KEY] = JSON.stringify(
      Array.from({ length: 250 }, (_, i) =>
        event(String(i), { clientEventId: `e-${i}`, reviewedAt: new Date(now - i * 1000).toISOString() })
      ).concat([event("old", { clientEventId: "old", reviewedAt: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString() })])
    );

    const queue = await loadPendingQueue(storage);
    expect(queue).toHaveLength(200);
    expect(queue.find((row) => row.clientEventId === "old")).toBeUndefined();

    await flushPendingReviews(api as never, storage);
    expect(api.reviewCard).toHaveBeenCalledTimes(MAX_PENDING_REVIEW_FLUSH_BATCH);
  });
});
