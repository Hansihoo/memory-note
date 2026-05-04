import { CardType, type Direction, type TodayStudyCard, type Word } from "../types";
import { debugLog } from "./logger";

interface StudyQueueItem {
  word: Word;
  direction: Direction;
  cardId?: string;
  cardType?: CardType;
  prompt?: string;
  answer?: string;
}

export interface StudyCard {
  word: Word;
  prompt: string;
  answer: string;
  direction: Direction;
  cardId?: string;
  cardType?: CardType;
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

export function cardTypeFromDirection(direction: Direction): CardType {
  return direction === "key-to-value" ? CardType.BASIC_KEY_TO_VALUE : CardType.BASIC_VALUE_TO_KEY;
}

export function directionFromCardType(cardType: CardType): Direction {
  return cardType === CardType.BASIC_VALUE_TO_KEY ? "value-to-key" : "key-to-value";
}

export function createStudySessionFromCards(cards: TodayStudyCard[]): StudySession {
  const queue = cards.map((card): StudyQueueItem => {
    const direction = directionFromCardType(card.cardType);
    const now = new Date().toISOString();
    return {
      word: {
        id: card.legacyWordId ?? card.cardId,
        wordbookId: card.wordbookId,
        key: direction === "key-to-value" ? card.prompt : card.answer,
        value: direction === "key-to-value" ? card.answer : card.prompt,
        lastViewedAt: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncRevision: 0
      },
      direction,
      cardId: card.cardId,
      cardType: card.cardType,
      prompt: card.prompt,
      answer: card.answer
    };
  });

  debugLog("session", "Created server study session", { size: queue.length });
  return { queue, index: 0, revealed: false };
}

export function getCurrentCard(session: StudySession): StudyCard | null {
  const item = session.queue[session.index];
  if (!item) {
    return null;
  }

  return {
    word: item.word,
    prompt: item.prompt ?? (item.direction === "key-to-value" ? item.word.key : item.word.value),
    answer: item.answer ?? (item.direction === "key-to-value" ? item.word.value : item.word.key),
    direction: item.direction,
    cardId: item.cardId,
    cardType: item.cardType
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
