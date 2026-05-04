export interface MemoryCard {
  id: string;
  prompt: string;
  answer: string;
  source?: string;
}

export type QuizPhase = "question" | "answer" | "complete";

export type QuizMark = "know" | "unknown";

export interface MiniQuizSessionOptions {
  maxQuestions?: number;
}

export interface MiniQuizSnapshot {
  phase: QuizPhase;
  currentCard: MemoryCard | null;
  answeredCount: number;
  maxQuestions: number;
  selectedMark: QuizMark | null;
  isComplete: boolean;
}

export interface MiniQuizSession {
  snapshot(): MiniQuizSnapshot;
  answer(mark: QuizMark): MiniQuizSnapshot;
  next(): MiniQuizSnapshot;
  reset(cards?: readonly MemoryCard[]): MiniQuizSnapshot;
}

export const DEFAULT_MINI_QUIZ_CARDS: MemoryCard[] = [
  {
    id: "travel-passport",
    prompt: "passport",
    answer: "여권",
    source: "extension-default"
  },
  {
    id: "travel-departure",
    prompt: "departure",
    answer: "출발",
    source: "extension-default"
  },
  {
    id: "travel-reservation",
    prompt: "reservation",
    answer: "예약",
    source: "extension-default"
  },
  {
    id: "travel-receipt",
    prompt: "receipt",
    answer: "영수증",
    source: "extension-default"
  },
  {
    id: "travel-directions",
    prompt: "directions",
    answer: "길 안내",
    source: "extension-default"
  }
];

export function sanitizeMemoryCards(cards: readonly MemoryCard[]): MemoryCard[] {
  return cards
    .map((card, index) => ({
      id: normalizeText(card.id) || `memory-card-${index + 1}`,
      prompt: normalizeText(card.prompt),
      answer: normalizeText(card.answer),
      source: normalizeText(card.source)
    }))
    .filter((card) => card.prompt.length > 0 && card.answer.length > 0);
}

export function createMiniQuizSession(
  inputCards: readonly MemoryCard[],
  options: MiniQuizSessionOptions = {}
): MiniQuizSession {
  let cards = sanitizeMemoryCards(inputCards);
  let currentIndex = cards.length > 0 ? 0 : -1;
  let phase: QuizPhase = cards.length > 0 ? "question" : "complete";
  let answeredCount = 0;
  let selectedMark: QuizMark | null = null;
  const maxQuestions = Math.max(1, Math.floor(options.maxQuestions ?? 10));

  function snapshot(): MiniQuizSnapshot {
    const isComplete = phase === "complete" || cards.length === 0;

    return {
      phase: isComplete ? "complete" : phase,
      currentCard: isComplete ? null : cards[currentIndex] ?? null,
      answeredCount,
      maxQuestions,
      selectedMark,
      isComplete
    };
  }

  function answer(mark: QuizMark): MiniQuizSnapshot {
    if (phase !== "question" || cards.length === 0) {
      return snapshot();
    }

    selectedMark = mark;
    answeredCount += 1;
    phase = "answer";

    return snapshot();
  }

  function next(): MiniQuizSnapshot {
    if (cards.length === 0 || answeredCount >= maxQuestions) {
      phase = "complete";
      selectedMark = null;
      return snapshot();
    }

    currentIndex = (currentIndex + 1) % cards.length;
    selectedMark = null;
    phase = "question";

    return snapshot();
  }

  function reset(nextCards: readonly MemoryCard[] = cards): MiniQuizSnapshot {
    cards = sanitizeMemoryCards(nextCards);
    currentIndex = cards.length > 0 ? 0 : -1;
    phase = cards.length > 0 ? "question" : "complete";
    answeredCount = 0;
    selectedMark = null;

    return snapshot();
  }

  return {
    snapshot,
    answer,
    next,
    reset
  };
}

function normalizeText(value: string | undefined): string {
  return String(value ?? "").trim();
}
