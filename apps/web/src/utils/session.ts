import type { Direction, Word } from "../types";
import { debugLog } from "./logger";

interface StudyQueueItem {
  word: Word;
  direction: Direction;
}

export interface StudyCard {
  word: Word;
  prompt: string;
  answer: string;
  direction: Direction;
}

export interface StudySession {
  queue: StudyQueueItem[];
  index: number;
  revealed: boolean;
}

export function createStudySession(words: Word[], random = Math.random): StudySession {
  const queue = [...words]
    .sort((a, b) => {
      if (a.lastViewedAt === b.lastViewedAt) {
        return a.createdAt.localeCompare(b.createdAt);
      }
      if (a.lastViewedAt === null) {
        return -1;
      }
      if (b.lastViewedAt === null) {
        return 1;
      }
      return a.lastViewedAt.localeCompare(b.lastViewedAt);
    })
    .map((word) => ({
      word,
      direction: (random() < 0.5 ? "key-to-value" : "value-to-key") as Direction
    }));

  debugLog("session", "Created study session", { size: queue.length });
  return { queue, index: 0, revealed: false };
}

export function getCurrentCard(session: StudySession): StudyCard | null {
  const item = session.queue[session.index];
  if (!item) {
    return null;
  }

  return {
    word: item.word,
    prompt: item.direction === "key-to-value" ? item.word.key : item.word.value,
    answer: item.direction === "key-to-value" ? item.word.value : item.word.key,
    direction: item.direction
  };
}

export function revealCurrent(session: StudySession): StudySession {
  return { ...session, revealed: true };
}

export function nextCard(session: StudySession): StudySession {
  const nextIndex = Math.min(session.index + 1, session.queue.length);
  debugLog("session", "Advanced study session", { nextIndex });
  return { ...session, index: nextIndex, revealed: false };
}

export function markCurrentViewed(words: Word[], wordId: string, viewedAt: string): Word[] {
  return words.map((word) =>
    word.id === wordId ? { ...word, lastViewedAt: viewedAt, updatedAt: viewedAt } : word
  );
}
