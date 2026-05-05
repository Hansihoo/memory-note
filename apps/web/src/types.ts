export { CardStatus, CardType, ReviewRating, StudyPlatform } from "@memory-note/core";
import type { CardStatus, CardType, ReviewRating } from "@memory-note/core";

export type Direction = "key-to-value" | "value-to-key";

export interface Word {
  id: string;
  wordbookId?: string;
  key: string;
  value: string;
  itemType?: "WORD" | "QA" | "COMMAND" | "SENTENCE";
  exampleSentence?: string | null;
  tags?: string[] | null;
  cloze?: string | null;
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

export interface MemorizedWordSummary {
  wordId: string;
  wordbookId: string;
  wordbookName: string;
  key: string;
  value: string;
  knownCount: number;
  lastStudiedAt: string | null;
}

export interface ProfileSummary {
  cumulativeLearningDays: number;
  todayStudiedCount: number;
  memorizedWordCount: number;
  memorizedWords: MemorizedWordSummary[];
  recentWordbooks: WordbookSummary[];
  masteredCount: number;
  weakCardCount: number;
  longTermReviewCount30d: number;
  longTermCorrectCount30d: number;
  longTermRecallRate30d: number;
  masteredLapseCount30d: number;
  oldMasteredDueCount: number;
}

export interface ProgressEvent {
  wordId: string;
  wordbookId: string;
  studiedAt: string;
  known: boolean;
}

export interface TodayStudySummary {
  dueCount: number;
  newCount: number;
  weakCount: number;
  estimatedMinutes: number;
}

export interface TodayStudyCard {
  cardId: string;
  memoryItemId: string;
  legacyWordId: string | null;
  wordbookId: string;
  cardType: CardType;
  prompt: string;
  answer: string;
  status: CardStatus;
  dueAt: string;
  lapses: number;
  leechScore: number;
  retrievability?: number;
  recommendationReason?: string | null;
  recommendationScore?: number | null;
}

export interface TodayStudyResponse {
  summary: TodayStudySummary;
  cards: TodayStudyCard[];
}

export interface MistakeCard extends TodayStudyCard {}

export interface CardReviewResponse {
  cardId: string;
  memoryItemId: string;
  legacyWordId: string | null;
  wordbookId: string;
  rating: ReviewRating;
  status: CardStatus;
  dueAt: string;
  lastReviewedAt: string | null;
  intervalDays: number;
  lapses: number;
  streak: number;
  leechScore: number;
  reviewLogId: string | null;
  deduplicated: boolean;
}
