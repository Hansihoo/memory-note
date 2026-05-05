import {
  advanceStudySession,
  cardTypeFromDirection,
  createStudySession as createCoreStudySession,
  createStudySessionFromTodayCards,
  getCurrentStudyCard,
  revealStudySession,
  type StudyDirection,
  type StudySessionCard,
  type StudySessionState
} from "@memory-note/core";
import type { TodayStudyCard, Word } from "../types";
import { debugLog } from "./logger";

export type Direction = StudyDirection;
export type StudyCard = StudySessionCard;
export type StudySession = StudySessionState;
export { cardTypeFromDirection, directionFromCardType } from "@memory-note/core";

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
    .map((word): StudySessionCard => {
      const direction = (random() < 0.5 ? "key-to-value" : "value-to-key") as Direction;
      return {
        id: word.id,
        direction,
        prompt: direction === "key-to-value" ? word.key : word.value,
        answer: direction === "key-to-value" ? word.value : word.key,
        cardType: cardTypeFromDirection(direction),
        legacyWordId: word.id,
        wordbookId: word.wordbookId
      };
    });

  debugLog("session", "Created study session", { size: queue.length });
  return createCoreStudySession(queue);
}

export function createStudySessionFromCards(cards: TodayStudyCard[]): StudySession {
  debugLog("session", "Created server study session", { size: cards.length });
  return createStudySessionFromTodayCards(cards);
}

export function getCurrentCard(session: StudySession): StudyCard | null {
  return getCurrentStudyCard(session);
}

export function revealCurrent(session: StudySession): StudySession {
  return revealStudySession(session);
}

export function nextCard(session: StudySession): StudySession {
  const nextIndex = Math.min(session.index + 1, session.queue.length);
  debugLog("session", "Advanced study session", { nextIndex });
  return advanceStudySession(session);
}

export function markCurrentViewed(words: Word[], wordId: string, viewedAt: string): Word[] {
  return words.map((word) =>
    word.id === wordId ? { ...word, lastViewedAt: viewedAt, updatedAt: viewedAt } : word
  );
}
