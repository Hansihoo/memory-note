import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudyPlatform } from "@memory-note/core";
import { flushPendingReviews, loadPendingQueue, PENDING_REVIEW_QUEUE_KEY } from "./pending-review";

const state: Record<string, unknown> = {};

vi.mock("./storage", () => ({
  readChromeLocalStorage: () => ({
    get(key: string, cb: (items: Record<string, unknown>) => void) {
      cb({ [key]: state[key] });
    },
    set(items: Record<string, unknown>, cb?: () => void) {
      Object.assign(state, items);
      cb?.();
    },
  }),
}));

const { submitMock } = vi.hoisted(() => ({ submitMock: vi.fn() }));
vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, submitServerReviewWithEvent: submitMock };
});

describe("pending review queue", () => {
  beforeEach(() => {
    state[PENDING_REVIEW_QUEUE_KEY] = [];
    submitMock.mockReset();
  });

  it("retry success removes queued review", async () => {
    state[PENDING_REVIEW_QUEUE_KEY] = [{ cardId: "1", rating: "GOOD", platform: StudyPlatform.EXTENSION, clientEventId: "e1", reviewedAt: new Date().toISOString(), attemptCount: 0, lastAttemptAt: null }];
    await flushPendingReviews();
    expect(await loadPendingQueue()).toHaveLength(0);
  });

  it("network failure keeps queued review and increments attemptCount", async () => {
    submitMock.mockRejectedValueOnce(new Error("network"));
    state[PENDING_REVIEW_QUEUE_KEY] = [{ cardId: "1", rating: "GOOD", platform: StudyPlatform.EXTENSION, clientEventId: "e1", reviewedAt: new Date().toISOString(), attemptCount: 0, lastAttemptAt: null }];
    await flushPendingReviews();
    const queue = await loadPendingQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].attemptCount).toBe(1);
  });

  it("401/403 stops flush and preserves queue", async () => {
    submitMock.mockRejectedValueOnce({ status: 401 });
    state[PENDING_REVIEW_QUEUE_KEY] = [{ cardId: "1", rating: "GOOD", platform: StudyPlatform.EXTENSION, clientEventId: "e1", reviewedAt: new Date().toISOString(), attemptCount: 0, lastAttemptAt: null }];
    const result = await flushPendingReviews();
    expect(result).toBe("auth_required");
    expect(await loadPendingQueue()).toHaveLength(1);
  });

  it("409 removes queued review", async () => {
    submitMock.mockRejectedValueOnce({ status: 409 });
    state[PENDING_REVIEW_QUEUE_KEY] = [{ cardId: "1", rating: "GOOD", platform: StudyPlatform.EXTENSION, clientEventId: "e1", reviewedAt: new Date().toISOString(), attemptCount: 0, lastAttemptAt: null }];
    await flushPendingReviews();
    expect(await loadPendingQueue()).toHaveLength(0);
  });

  it("old events are dropped and queue capped at 200", async () => {
    const now = Date.now();
    state[PENDING_REVIEW_QUEUE_KEY] = Array.from({ length: 250 }, (_, i) => ({
      cardId: String(i),
      rating: "GOOD",
      platform: StudyPlatform.EXTENSION,
      clientEventId: `e-${i}`,
      reviewedAt: new Date(now - i * 1000).toISOString(),
      attemptCount: 0,
      lastAttemptAt: null,
    })).concat([
      { cardId: "old", rating: "GOOD", platform: StudyPlatform.EXTENSION, clientEventId: "old", reviewedAt: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(), attemptCount: 0, lastAttemptAt: null },
    ]);
    const queue = await loadPendingQueue();
    expect(queue).toHaveLength(200);
    expect(queue.find((row) => row.clientEventId === "old")).toBeUndefined();
  });
});
