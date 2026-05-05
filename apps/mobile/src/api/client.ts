import {
  ReviewRating,
  StudyPlatform,
  type ReviewResponse,
  type TodayCard,
  type TodaySummary
} from "@memory-note/core";

import { API_BASE_URL } from "../config";

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
}

export interface ProfileSummary {
  cumulativeLearningDays: number;
  todayStudiedCount: number;
  memorizedWordCount: number;
  masteredCount: number;
  weakCardCount: number;
  longTermReviewCount30d: number;
  longTermCorrectCount30d: number;
  longTermRecallRate30d: number;
  masteredLapseCount30d: number;
  oldMasteredDueCount: number;
}

interface ServerUser {
  id: number;
  username: string;
  displayName?: string | null;
}

interface ServerToken {
  token: string;
  user: ServerUser;
}

interface ServerTodayCard {
  cardId: number;
  memoryItemId: number;
  legacyWordId?: number | null;
  wordbookId: number;
  cardType: TodayCard["cardType"];
  prompt: string;
  answer: string;
  status: string;
  dueAt: string;
  lapses: number;
  leechScore: number;
  retrievability?: number;
}

interface ServerTodayStudyResponse {
  summary: TodaySummary;
  cards: ServerTodayCard[];
}

interface ServerReviewResponse {
  cardId: number;
  memoryItemId: number;
  legacyWordId?: number | null;
  wordbookId: number;
  rating: ReviewRating;
  status: string;
  dueAt: string;
  lastReviewedAt: string | null;
  intervalDays: number;
  lapses: number;
  streak: number;
  leechScore: number;
  reviewLogId?: number | null;
  deduplicated?: boolean;
}

interface ServerProfileSummary {
  cumulativeLearningDays: number;
  todayStudiedCount: number;
  memorizedWordCount?: number;
  masteredCount?: number;
  weakCardCount?: number;
  longTermReviewCount30d?: number;
  longTermCorrectCount30d?: number;
  longTermRecallRate30d?: number | null;
  masteredLapseCount30d?: number;
  oldMasteredDueCount?: number;
}

export class MobileApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "MobileApiError";
    this.status = status;
  }
}

export interface MobileApiClientOptions {
  baseUrl?: string;
  getToken?: () => string | null | Promise<string | null>;
  fetchImpl?: typeof fetch;
}

function mapUser(user: ServerUser): UserProfile {
  return {
    id: String(user.id),
    username: user.username,
    displayName: user.displayName || user.username
  };
}

function mapTodayCard(card: ServerTodayCard): TodayCard {
  return {
    cardId: String(card.cardId),
    memoryItemId: String(card.memoryItemId),
    legacyWordId: card.legacyWordId == null ? null : String(card.legacyWordId),
    wordbookId: String(card.wordbookId),
    cardType: card.cardType,
    prompt: card.prompt,
    answer: card.answer,
    status: card.status,
    dueAt: card.dueAt,
    lapses: card.lapses,
    leechScore: card.leechScore,
    retrievability: card.retrievability
  };
}

function mapReviewResponse(response: ServerReviewResponse): ReviewResponse {
  return {
    cardId: String(response.cardId),
    memoryItemId: String(response.memoryItemId),
    legacyWordId: response.legacyWordId == null ? null : String(response.legacyWordId),
    wordbookId: String(response.wordbookId),
    rating: response.rating,
    status: response.status,
    dueAt: response.dueAt,
    lastReviewedAt: response.lastReviewedAt,
    intervalDays: response.intervalDays,
    lapses: response.lapses,
    streak: response.streak,
    leechScore: response.leechScore,
    reviewLogId: response.reviewLogId == null ? null : String(response.reviewLogId),
    deduplicated: response.deduplicated ?? false
  };
}

function mapProfileSummary(summary: ServerProfileSummary): ProfileSummary {
  return {
    cumulativeLearningDays: summary.cumulativeLearningDays,
    todayStudiedCount: summary.todayStudiedCount,
    memorizedWordCount: summary.memorizedWordCount ?? 0,
    masteredCount: summary.masteredCount ?? 0,
    weakCardCount: summary.weakCardCount ?? 0,
    longTermReviewCount30d: summary.longTermReviewCount30d ?? 0,
    longTermCorrectCount30d: summary.longTermCorrectCount30d ?? 0,
    longTermRecallRate30d: summary.longTermRecallRate30d ?? 0,
    masteredLapseCount30d: summary.masteredLapseCount30d ?? 0,
    oldMasteredDueCount: summary.oldMasteredDueCount ?? 0
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  return (await response.text().catch(() => "")) || response.statusText || `Request failed with ${response.status}`;
}

export function createMobileApiClient(options: MobileApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? API_BASE_URL).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const getToken = options.getToken ?? (() => null);

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers
      }
    });

    if (!response.ok) {
      throw new MobileApiError(await readErrorMessage(response), response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  return {
    getApiBaseUrl() {
      return baseUrl;
    },
    async login(payload: { username: string; password: string }) {
      const result = await request<ServerToken>("/auth/login", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return { token: result.token, user: mapUser(result.user) };
    },
    async register(payload: { username: string; password: string }) {
      const result = await request<ServerToken>("/auth/register", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return { token: result.token, user: mapUser(result.user) };
    },
    async me() {
      return mapUser(await request<ServerUser>("/me"));
    },
    async logout() {
      await request<void>("/auth/logout", { method: "POST" });
    },
    async studyToday(limit = 20) {
      const params = new URLSearchParams({ limit: String(limit) });
      const response = await request<ServerTodayStudyResponse>(`/study/today?${params.toString()}`);
      return { summary: response.summary, cards: response.cards.map(mapTodayCard) };
    },
    async studyMistakes(limit = 20) {
      const params = new URLSearchParams({ limit: String(limit) });
      const response = await request<ServerTodayStudyResponse>(`/study/mistakes?${params.toString()}`);
      return { summary: response.summary, cards: response.cards.map(mapTodayCard) };
    },
    async profileSummary() {
      return mapProfileSummary(await request<ServerProfileSummary>("/profile/summary"));
    },
    async reviewCard(
      cardId: string,
      payload: {
        rating: ReviewRating;
        platform: StudyPlatform;
        clientEventId: string;
        responseText?: string;
      }
    ) {
      return mapReviewResponse(
        await request<ServerReviewResponse>(`/study/cards/${encodeURIComponent(cardId)}/review`, {
          method: "POST",
          body: JSON.stringify(payload)
        })
      );
    }
  };
}

export type MobileApiClient = ReturnType<typeof createMobileApiClient>;
