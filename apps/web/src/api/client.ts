import type { ProfileSummary, UserProfile, Word, Wordbook, WordbookSummary } from "../types";

const DEFAULT_API_BASE_URL = "http://localhost:8000";
const TOKEN_KEY = "memory-assistant-token";

const envBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

export const API_BASE_URL = (envBaseUrl?.trim() || DEFAULT_API_BASE_URL).replace(/\/$/, "");

interface ServerUser {
  id: number;
  username: string;
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
  wordCount?: number;
}

interface ServerWord {
  id: number;
  wordbookId: number;
  key: string;
  value: string;
  lastViewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ServerProfileSummary {
  cumulativeLearningDays: number;
  todayStudiedCount: number;
  recentWordbooks: Array<{
    wordbookId: number;
    name: string;
    studiedCount: number;
    knownCount: number;
    unknownCount: number;
    lastStudiedAt: string | null;
  }>;
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
  return { id: String(user.id), displayName: user.username };
}

function mapWord(word: ServerWord): Word {
  return {
    id: String(word.id),
    wordbookId: String(word.wordbookId),
    key: word.key,
    value: word.value,
    lastViewedAt: word.lastViewedAt,
    createdAt: word.createdAt,
    updatedAt: word.updatedAt
  };
}

function mapWordbook(wordbook: ServerWordbook, words: Word[] = []): Wordbook {
  return {
    id: String(wordbook.id),
    name: wordbook.name,
    words,
    createdAt: wordbook.createdAt,
    updatedAt: wordbook.updatedAt
  };
}

function mapProfile(summary: ServerProfileSummary): ProfileSummary {
  return {
    cumulativeLearningDays: summary.cumulativeLearningDays,
    todayStudiedCount: summary.todayStudiedCount,
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

export const apiClient = {
  hasToken() {
    return getToken().length > 0;
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
  async studyWord(wordId: string, result: "known" | "unknown") {
    const response = await request<{ word: ServerWord }>(`/study/words/${wordId}`, {
      method: "POST",
      body: JSON.stringify({ result })
    });
    return mapWord(response.word);
  },
  async profileSummary() {
    return mapProfile(await request<ServerProfileSummary>("/profile/summary"));
  }
};
