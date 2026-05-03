export type Direction = "key-to-value" | "value-to-key";

export interface Word {
  id: string;
  wordbookId?: string;
  key: string;
  value: string;
  lastViewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncRevision: number;
}

export interface Wordbook {
  id: string;
  name: string;
  words: Word[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncRevision: number;
}

export interface UserProfile {
  id: string;
  displayName: string;
}

export interface WordbookSummary {
  wordbookId: string;
  name: string;
  studiedCount: number;
  knownCount: number;
  unknownCount: number;
  lastStudiedAt: string | null;
}

export interface ProfileSummary {
  cumulativeLearningDays: number;
  todayStudiedCount: number;
  recentWordbooks: WordbookSummary[];
}

export interface ProgressEvent {
  wordId: string;
  wordbookId: string;
  studiedAt: string;
  known: boolean;
}
