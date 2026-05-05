import {
  EXTENSION_REVIEW_RATING_BY_MARK,
  StudyPlatform,
  type MemoryCard,
  type QuizMark,
  type ReviewRating,
} from "@memory-note/core";

import { loadExtensionAuth, type ExtensionAuth } from "./auth";

interface ServerTodayStudyCard {
  cardId: number | string;
  memoryItemId: number | string;
  legacyWordId?: number | string | null;
  wordbookId: number | string;
  cardType: string;
  prompt: string;
  answer: string;
}

interface ServerTodayStudyResponse {
  cards?: ServerTodayStudyCard[];
}

export class ExtensionAuthMissingError extends Error {
  constructor() {
    super("Memory Note login is not connected.");
    this.name = "ExtensionAuthMissingError";
  }
}

export class ExtensionApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ExtensionApiError";
    this.status = status;
  }
}

export async function loadServerStudyCards(
  limit: number,
  authPromise: Promise<ExtensionAuth | null> = loadExtensionAuth(),
): Promise<MemoryCard[]> {
  const auth = await authPromise;
  if (!auth) {
    throw new ExtensionAuthMissingError();
  }

  const params = new URLSearchParams({ limit: String(Math.max(1, limit)) });
  const response = await fetch(`${auth.apiBaseUrl}/study/today?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
  });

  if (!response.ok) {
    throw new ExtensionApiError(`Study cards request failed with ${response.status}`);
  }

  const body = (await response.json()) as ServerTodayStudyResponse;
  return (body.cards ?? []).map(serverCardToMemoryCard).filter((card) => card.prompt && card.answer);
}

export async function submitServerReview(
  cardId: string,
  mark: QuizMark,
  authPromise: Promise<ExtensionAuth | null> = loadExtensionAuth(),
): Promise<void> {
  const auth = await authPromise;
  if (!auth) {
    throw new ExtensionAuthMissingError();
  }

  const response = await fetch(`${auth.apiBaseUrl}/study/cards/${encodeURIComponent(cardId)}/review`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      rating: ratingFromQuizMark(mark),
      platform: StudyPlatform.EXTENSION,
      clientEventId: createReviewClientEventId(cardId, mark),
    }),
  });

  if (!response.ok) {
    throw new ExtensionApiError(`Review request failed with ${response.status}`, response.status);
  }
}

export async function submitServerReviewWithEvent(
  cardId: string,
  rating: ReviewRating,
  clientEventId: string,
  authPromise: Promise<ExtensionAuth | null> = loadExtensionAuth(),
): Promise<void> {
  const auth = await authPromise;
  if (!auth) {
    throw new ExtensionAuthMissingError();
  }
  const response = await fetch(`${auth.apiBaseUrl}/study/cards/${encodeURIComponent(cardId)}/review`, {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ rating, platform: StudyPlatform.EXTENSION, clientEventId }),
  });
  if (!response.ok) {
    throw new ExtensionApiError(`Review request failed with ${response.status}`, response.status);
  }
}

export function ratingFromQuizMark(mark: QuizMark): ReviewRating {
  return EXTENSION_REVIEW_RATING_BY_MARK[mark];
}

export function createReviewClientEventId(cardId: string, mark: QuizMark): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `extension-${cardId}-${mark}-${randomId}`;
}

function serverCardToMemoryCard(card: ServerTodayStudyCard): MemoryCard {
  return {
    id: String(card.cardId),
    prompt: String(card.prompt ?? "").trim(),
    answer: String(card.answer ?? "").trim(),
    source: `server:${card.wordbookId}:${card.memoryItemId}:${card.cardType}`,
  };
}
