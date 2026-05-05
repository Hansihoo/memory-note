import { ReviewRating, StudyPlatform } from "@memory-note/core";

export function createMobileReviewClientEventId(cardId: string, rating: ReviewRating): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `mobile-${cardId}-${rating}-${randomId}`;
}

export function createMobileReviewPayload(cardId: string, rating: ReviewRating) {
  return {
    rating,
    platform: StudyPlatform.MOBILE,
    clientEventId: createMobileReviewClientEventId(cardId, rating)
  };
}
