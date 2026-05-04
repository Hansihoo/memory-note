import type {
  CardReviewResponse,
  CardStatus,
  CardType,
  MemorizedWordSummary,
  ProfileSummary,
  ReviewRating,
  StudyPlatform,
  TodayStudyCard,
  TodayStudyResponse,
  UserProfile,
  Word,
  Wordbook,
  WordbookSummary
} from "../types";

const DEFAULT_API_BASE_URL = "http://localhost:8000";
const TOKEN_KEY = "memory-assistant-token";

const envBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

export const API_BASE_URL = (envBaseUrl?.trim() || DEFAULT_API_BASE_URL).replace(/\/$/, "");

interface ServerUser {
  id: number;
  username: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  authProvider?: string;
  syncRevision?: number;
}

interface ServerToken {
  token: string;
  user: ServerUser;
}

interface ServerWordbook {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncRevision: number;
  wordCount?: number;
}

interface ServerWord {
  id: number;
  wordbookId: number;
  key: string;
  value: string;
  itemType?: Word["itemType"];
  lastViewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncRevision: number;
}

interface ServerSyncPull {
  serverRevision: number;
  wordbooks: ServerWordbook[];
  words: ServerWord[];
}

interface ServerProfileSummary {
  cumulativeLearningDays: number;
  todayStudiedCount: number;
  memorizedWordCount?: number;
  memorizedWords?: Array<{
    wordId: number;
    wordbookId: number;
    wordbookName: string;
    key: string;
    value: string;
    knownCount: number;
    lastStudiedAt: string | null;
  }>;
  recentWordbooks: Array<{
    wordbookId: number;
    name: string;
    studiedCount: number;
    knownCount: number;
    unknownCount: number;
    lastStudiedAt: string | null;
  }>;
}

interface ServerTodayStudyCard {
  cardId: number;
  memoryItemId: number;
  legacyWordId?: number | null;
  wordbookId: number;
  cardType: CardType;
  prompt: string;
  answer: string;
  status: CardStatus;
  dueAt: string;
  lapses: number;
  leechScore: number;
  retrievability?: number;
}

interface ServerTodayStudyResponse {
  summary: TodayStudyResponse["summary"];
  cards: ServerTodayStudyCard[];
}

interface ServerCardReviewResponse {
  cardId: number;
  memoryItemId: number;
  legacyWordId?: number | null;
  wordbookId: number;
  rating: ReviewRating;
  status: CardStatus;
  dueAt: string;
  lastReviewedAt: string | null;
  intervalDays: number;
  lapses: number;
  streak: number;
  leechScore: number;
  reviewLogId?: number | null;
  deduplicated?: boolean;
}

function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers
    },
    ...init
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(message || `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function mapUser(user: ServerUser): UserProfile {
  return { id: String(user.id), displayName: user.displayName || user.username };
}

function mapWord(word: ServerWord): Word {
  return {
    id: String(word.id),
    wordbookId: String(word.wordbookId),
    key: word.key,
    value: word.value,
    itemType: word.itemType ?? "WORD",
    lastViewedAt: word.lastViewedAt,
    createdAt: word.createdAt,
    updatedAt: word.updatedAt,
    deletedAt: word.deletedAt ?? null,
    syncRevision: word.syncRevision ?? 0
  };
}

function mapWordbook(wordbook: ServerWordbook, words: Word[] = []): Wordbook {
  return {
    id: String(wordbook.id),
    name: wordbook.name,
    words,
    createdAt: wordbook.createdAt,
    updatedAt: wordbook.updatedAt,
    deletedAt: wordbook.deletedAt ?? null,
    syncRevision: wordbook.syncRevision ?? 0
  };
}

function mapSyncWordbooks(sync: ServerSyncPull): Wordbook[] {
  const wordsByWordbook = new Map<string, Word[]>();
  for (const word of sync.words.map(mapWord).filter((word) => !word.deletedAt)) {
    const key = word.wordbookId ?? "";
    wordsByWordbook.set(key, [...(wordsByWordbook.get(key) ?? []), word]);
  }
  return sync.wordbooks
    .map((wordbook) => mapWordbook(wordbook, wordsByWordbook.get(String(wordbook.id)) ?? []))
    .filter((wordbook) => !wordbook.deletedAt);
}

function mapProfile(summary: ServerProfileSummary): ProfileSummary {
  return {
    cumulativeLearningDays: summary.cumulativeLearningDays,
    todayStudiedCount: summary.todayStudiedCount,
    memorizedWordCount: summary.memorizedWordCount ?? summary.memorizedWords?.length ?? 0,
    memorizedWords: (summary.memorizedWords ?? []).map((word): MemorizedWordSummary => ({
      wordId: String(word.wordId),
      wordbookId: String(word.wordbookId),
      wordbookName: word.wordbookName,
      key: word.key,
      value: word.value,
      knownCount: word.knownCount,
      lastStudiedAt: word.lastStudiedAt
    })),
    recentWordbooks: summary.recentWordbooks.map((wordbook): WordbookSummary => ({
      wordbookId: String(wordbook.wordbookId),
      name: wordbook.name,
      studiedCount: wordbook.studiedCount,
      knownCount: wordbook.knownCount,
      unknownCount: wordbook.unknownCount,
      lastStudiedAt: wordbook.lastStudiedAt
    }))
  };
}

function mapTodayStudyCard(card: ServerTodayStudyCard): TodayStudyCard {
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

function mapTodayStudyResponse(response: ServerTodayStudyResponse): TodayStudyResponse {
  return {
    summary: response.summary,
    cards: response.cards.map(mapTodayStudyCard)
  };
}

function mapCardReview(response: ServerCardReviewResponse): CardReviewResponse {
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

export const apiClient = {
  hasToken() {
    return getToken().length > 0;
  },
  getToken() {
    return getToken();
  },
  getApiBaseUrl() {
    return API_BASE_URL;
  },
  async register(payload: { username: string; password: string }) {
    const result = await request<ServerToken>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    setToken(result.token);
    return mapUser(result.user);
  },
  async login(payload: { username: string; password: string }) {
    const result = await request<ServerToken>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    setToken(result.token);
    return mapUser(result.user);
  },
  async loginOrRegister(payload: { username: string; password: string }) {
    try {
      return await this.login(payload);
    } catch {
      return this.register(payload);
    }
  },
  async loginWithGoogle(idToken: string) {
    const result = await request<ServerToken>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken })
    });
    setToken(result.token);
    return mapUser(result.user);
  },
  async logout() {
    try {
      await request<void>("/auth/logout", { method: "POST" });
    } finally {
      clearToken();
    }
  },
  async me() {
    const user = await request<ServerUser>("/me");
    return mapUser(user);
  },
  async listWordbooks() {
    const wordbooks = await request<ServerWordbook[]>("/wordbooks");
    return Promise.all(
      wordbooks.map(async (wordbook) => mapWordbook(wordbook, await this.listWords(String(wordbook.id))))
    );
  },
  async syncPull(sinceRevision = 0) {
    return mapSyncWordbooks(await request<ServerSyncPull>(`/sync/pull?sinceRevision=${sinceRevision}`));
  },
  async createWordbook(name: string) {
    const wordbook = await request<ServerWordbook>("/wordbooks", {
      method: "POST",
      body: JSON.stringify({ name })
    });
    return mapWordbook(wordbook);
  },
  async renameWordbook(wordbookId: string, name: string) {
    const wordbook = await request<ServerWordbook>(`/wordbooks/${wordbookId}`, {
      method: "PATCH",
      body: JSON.stringify({ name })
    });
    return mapWordbook(wordbook);
  },
  async deleteWordbook(wordbookId: string) {
    await request<void>(`/wordbooks/${wordbookId}`, { method: "DELETE" });
  },
  async listWords(wordbookId: string) {
    const words = await request<ServerWord[]>(`/wordbooks/${wordbookId}/words`);
    return words.map(mapWord);
  },
  async createWord(wordbookId: string, payload: Pick<Word, "key" | "value"> & { lastViewedAt?: string | null }) {
    const word = await request<ServerWord>(`/wordbooks/${wordbookId}/words`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return mapWord(word);
  },
  async batchWords(wordbookId: string, words: Array<Pick<Word, "key" | "value"> & { lastViewedAt?: string | null }>) {
    const result = await request<{ words: ServerWord[] }>(`/wordbooks/${wordbookId}/words/batch`, {
      method: "POST",
      body: JSON.stringify({ words })
    });
    return result.words.map(mapWord);
  },
  async updateWord(wordId: string, payload: Partial<Pick<Word, "key" | "value" | "lastViewedAt">>) {
    const word = await request<ServerWord>(`/words/${wordId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    return mapWord(word);
  },
  async deleteWord(wordId: string) {
    await request<void>(`/words/${wordId}`, { method: "DELETE" });
  },
  async studyToday(wordbookId?: string, limit = 20) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (wordbookId) {
      params.set("wordbookId", wordbookId);
    }
    return mapTodayStudyResponse(await request<ServerTodayStudyResponse>(`/study/today?${params.toString()}`));
  },
  async reviewCard(
    cardId: string,
    payload: {
      rating: ReviewRating;
      platform?: StudyPlatform;
      clientEventId?: string;
      latencyMs?: number;
      confidence?: number;
    }
  ) {
    return mapCardReview(
      await request<ServerCardReviewResponse>(`/study/cards/${cardId}/review`, {
        method: "POST",
        body: JSON.stringify(payload)
      })
    );
  },
  async studyWord(
    wordId: string,
    result: "known" | "unknown",
    options: { cardType?: CardType; platform?: StudyPlatform; clientEventId?: string } = {}
  ) {
    const response = await request<{ word: ServerWord }>(`/study/words/${wordId}`, {
      method: "POST",
      body: JSON.stringify({ result, ...options })
    });
    return mapWord(response.word);
  },
  async profileSummary() {
    return mapProfile(await request<ServerProfileSummary>("/profile/summary"));
  }
};
