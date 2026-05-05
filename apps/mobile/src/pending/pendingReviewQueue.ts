import AsyncStorage from "@react-native-async-storage/async-storage";
import { StudyPlatform, createPendingReviewEvent, type PendingReviewEvent, type ReviewRating } from "@memory-note/core";

import type { MobileApiClient } from "../api/client";

export const PENDING_REVIEW_QUEUE_KEY = "memory-note-mobile-pending-review-queue";
export const MAX_PENDING_REVIEW_QUEUE = 200;
export const MAX_PENDING_REVIEW_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_PENDING_REVIEW_FLUSH_BATCH = 20;

export interface PendingReviewStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export function createPendingReviewForFailedAttempt(input: {
  cardId: string;
  rating: ReviewRating;
  clientEventId: string;
  responseText?: string;
}): PendingReviewEvent {
  const event = createPendingReviewEvent({
    cardId: input.cardId,
    rating: input.rating,
    platform: StudyPlatform.MOBILE,
    clientEventId: input.clientEventId,
    responseText: input.responseText
  });
  return { ...event, attemptCount: 1, lastAttemptAt: new Date().toISOString() };
}

export async function enqueuePendingReview(
  event: PendingReviewEvent,
  storage: PendingReviewStorage = AsyncStorage
): Promise<void> {
  const queue = await loadPendingQueue(storage);
  const withoutDuplicate = queue.filter((row) => row.clientEventId !== event.clientEventId);
  await savePendingQueue([...withoutDuplicate, event], storage);
}

export async function flushPendingReviews(
  api: MobileApiClient,
  storage: PendingReviewStorage = AsyncStorage
): Promise<"ok" | "auth_required"> {
  const queue = await loadPendingQueue(storage);
  const ordered = [...queue].sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt)).slice(0, MAX_PENDING_REVIEW_FLUSH_BATCH);
  const remain = [...queue];

  for (const event of ordered) {
    try {
      await api.reviewCard(event.cardId, {
        rating: event.rating,
        platform: event.platform,
        clientEventId: event.clientEventId,
        responseText: event.responseText
      });
      removeById(remain, event.clientEventId);
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) {
        await savePendingQueue(remain, storage);
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

  await savePendingQueue(remain, storage);
  return "ok";
}

export async function loadPendingQueue(storage: PendingReviewStorage = AsyncStorage): Promise<PendingReviewEvent[]> {
  const raw = await storage.getItem(PENDING_REVIEW_QUEUE_KEY);
  const rows = raw ? JSON.parse(raw) : [];
  const now = Date.now();

  return (Array.isArray(rows) ? rows : [])
    .filter(isPendingReviewEvent)
    .filter((row) => now - Date.parse(row.reviewedAt) <= MAX_PENDING_REVIEW_AGE_MS)
    .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))
    .slice(0, MAX_PENDING_REVIEW_QUEUE);
}

async function savePendingQueue(queue: PendingReviewEvent[], storage: PendingReviewStorage) {
  const normalized = queue
    .filter((row) => Date.now() - Date.parse(row.reviewedAt) <= MAX_PENDING_REVIEW_AGE_MS)
    .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))
    .slice(0, MAX_PENDING_REVIEW_QUEUE);
  await storage.setItem(PENDING_REVIEW_QUEUE_KEY, JSON.stringify(normalized));
}

function isPendingReviewEvent(row: unknown): row is PendingReviewEvent {
  return (
    !!row &&
    typeof row === "object" &&
    typeof (row as PendingReviewEvent).cardId === "string" &&
    typeof (row as PendingReviewEvent).clientEventId === "string" &&
    typeof (row as PendingReviewEvent).reviewedAt === "string"
  );
}

function removeById(queue: PendingReviewEvent[], clientEventId: string) {
  const index = queue.findIndex((row) => row.clientEventId === clientEventId);
  if (index >= 0) {
    queue.splice(index, 1);
  }
}
