import { CardType, ReviewRating, StudyPlatform } from "./types";

export type StudyDirection = "key-to-value" | "value-to-key";

export interface TodaySummary {
  dueCount: number;
  newCount: number;
  weakCount: number;
  estimatedMinutes: number;
  masteredCheckCount?: number;
}

export interface TodayCard {
  cardId: string;
  memoryItemId: string;
  legacyWordId: string | null;
  wordbookId: string;
  cardType: CardType;
  prompt: string;
  answer: string;
  status?: string;
  dueAt?: string;
  lapses?: number;
  leechScore?: number;
  retrievability?: number;
}

export interface ReviewRequest {
  rating: ReviewRating;
  platform?: StudyPlatform;
  clientEventId?: string;
  responseText?: string;
  latencyMs?: number;
  confidence?: number;
}

export interface ReviewResponse {
  cardId: string;
  memoryItemId: string;
  legacyWordId: string | null;
  wordbookId: string;
  rating: ReviewRating;
  status: string;
  dueAt: string;
  lastReviewedAt: string | null;
  intervalDays: number;
  lapses: number;
  streak: number;
  leechScore: number;
  reviewLogId: string | null;
  deduplicated: boolean;
}

export interface PendingReviewEvent {
  cardId: string;
  rating: ReviewRating;
  platform: StudyPlatform;
  clientEventId: string;
  reviewedAt: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  responseText?: string;
}

export interface StudySessionCard {
  id: string;
  prompt: string;
  answer: string;
  direction: StudyDirection;
  cardId?: string;
  cardType?: CardType;
  legacyWordId?: string | null;
  wordbookId?: string;
}

export interface StudySessionState {
  queue: StudySessionCard[];
  index: number;
  revealed: boolean;
}

export function cardTypeFromDirection(direction: StudyDirection): CardType {
  return direction === "key-to-value" ? CardType.BASIC_KEY_TO_VALUE : CardType.BASIC_VALUE_TO_KEY;
}

export function directionFromCardType(cardType: CardType): StudyDirection {
  return cardType === CardType.BASIC_VALUE_TO_KEY ? "value-to-key" : "key-to-value";
}

export function createStudySession(cards: readonly StudySessionCard[]): StudySessionState {
  return { queue: cards.map((card) => ({ ...card })), index: 0, revealed: false };
}

export function createStudySessionFromTodayCards(cards: readonly TodayCard[]): StudySessionState {
  return createStudySession(
    cards.map((card) => ({
      id: card.cardId,
      prompt: card.prompt,
      answer: card.answer,
      direction: directionFromCardType(card.cardType),
      cardId: card.cardId,
      cardType: card.cardType,
      legacyWordId: card.legacyWordId,
      wordbookId: card.wordbookId
    }))
  );
}

export function getCurrentStudyCard(session: StudySessionState): StudySessionCard | null {
  return session.queue[session.index] ?? null;
}

export function revealStudySession(session: StudySessionState): StudySessionState {
  return { ...session, revealed: true };
}

export function advanceStudySession(session: StudySessionState): StudySessionState {
  return { ...session, index: Math.min(session.index + 1, session.queue.length), revealed: false };
}

export function createPendingReviewEvent(input: Omit<PendingReviewEvent, "attemptCount" | "lastAttemptAt" | "reviewedAt"> & { reviewedAt?: string }): PendingReviewEvent {
  return {
    ...input,
    reviewedAt: input.reviewedAt ?? new Date().toISOString(),
    attemptCount: 0,
    lastAttemptAt: null
  };
}
