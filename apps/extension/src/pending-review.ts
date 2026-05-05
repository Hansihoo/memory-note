import { StudyPlatform, createPendingReviewEvent, type PendingReviewEvent, type QuizMark } from "@memory-note/core";
import { readChromeLocalStorage } from "./storage";
import { createReviewClientEventId, ratingFromQuizMark, submitServerReviewWithEvent } from "./api";

export const PENDING_REVIEW_QUEUE_KEY = "pendingReviewQueue";
const MAX_QUEUE = 200;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FLUSH_BATCH = 20;

export async function enqueuePendingReview(cardId: string, mark: QuizMark): Promise<void> {
  const queue = await loadPendingQueue();
  queue.push(createPendingReviewEvent({
    cardId,
    rating: ratingFromQuizMark(mark),
    platform: StudyPlatform.EXTENSION,
    clientEventId: createReviewClientEventId(cardId, mark),
  }));
  await savePendingQueue(queue);
}

export async function flushPendingReviews(): Promise<"ok" | "auth_required"> {
  const queue = await loadPendingQueue();
  const ordered = [...queue].sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt)).slice(0, MAX_FLUSH_BATCH);
  const remain = [...queue];
  for (const event of ordered) {
    try {
      await submitServerReviewWithEvent(event.cardId, event.rating, event.clientEventId);
      removeById(remain, event.clientEventId);
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) {
        await savePendingQueue(remain);
        return "auth_required";
      }
      if (status === 404 || status === 409 || status === 422) {
        removeById(remain, event.clientEventId);
        continue;
      }
      const target = remain.find((row) => row.clientEventId === event.clientEventId);
      if (target) {
        target.attemptCount += 1;
        target.lastAttemptAt = new Date().toISOString();
      }
    }
  }
  await savePendingQueue(remain);
  return "ok";
}

export async function loadPendingQueue() {
  const storage = readChromeLocalStorage();
  if (!storage) return [] as PendingReviewEvent[];
  const raw = await new Promise<unknown>((resolve) => storage.get(PENDING_REVIEW_QUEUE_KEY, (items) => resolve(items[PENDING_REVIEW_QUEUE_KEY])));
  const rows = Array.isArray(raw) ? raw : [];
  const now = Date.now();
  return rows
    .filter((row): row is PendingReviewEvent => !!row && typeof row === "object" && typeof (row as PendingReviewEvent).clientEventId === "string")
    .filter((row) => now - Date.parse(row.reviewedAt) <= MAX_AGE_MS)
    .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))
    .slice(0, MAX_QUEUE);
}

async function savePendingQueue(queue: PendingReviewEvent[]) {
  const storage = readChromeLocalStorage();
  if (!storage) return;
  const normalized = queue
    .filter((row) => Date.now() - Date.parse(row.reviewedAt) <= MAX_AGE_MS)
    .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))
    .slice(0, MAX_QUEUE);
  await new Promise<void>((resolve) => storage.set({ [PENDING_REVIEW_QUEUE_KEY]: normalized }, () => resolve()));
}

function removeById(queue: PendingReviewEvent[], clientEventId: string) {
  const index = queue.findIndex((row) => row.clientEventId === clientEventId);
  if (index >= 0) queue.splice(index, 1);
}
