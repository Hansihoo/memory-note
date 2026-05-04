import { describe, expect, it } from "vitest";

import { createMiniQuizSession, sanitizeMemoryCards } from "./miniQuiz";

describe("mini quiz session", () => {
  it("sanitizes empty cards", () => {
    const cards = sanitizeMemoryCards([
      { id: " a ", prompt: " word ", answer: " 뜻 " },
      { id: "blank-prompt", prompt: " ", answer: "answer" },
      { id: "blank-answer", prompt: "prompt", answer: " " }
    ]);

    expect(cards).toEqual([
      {
        id: "a",
        prompt: "word",
        answer: "뜻",
        source: ""
      }
    ]);
  });

  it("reveals the answer after an O/X mark", () => {
    const session = createMiniQuizSession(
      [{ id: "one", prompt: "passport", answer: "여권" }],
      { maxQuestions: 10 }
    );

    expect(session.snapshot().phase).toBe("question");

    const answer = session.answer("know");

    expect(answer.phase).toBe("answer");
    expect(answer.currentCard?.answer).toBe("여권");
    expect(answer.answeredCount).toBe(1);
    expect(answer.selectedMark).toBe("know");
  });

  it("wraps cards until the round limit is reached", () => {
    const session = createMiniQuizSession(
      [
        { id: "one", prompt: "passport", answer: "여권" },
        { id: "two", prompt: "departure", answer: "출발" }
      ],
      { maxQuestions: 3 }
    );

    expect(session.snapshot().currentCard?.id).toBe("one");
    session.answer("know");
    expect(session.next().currentCard?.id).toBe("two");
    session.answer("unknown");
    expect(session.next().currentCard?.id).toBe("one");
    session.answer("know");

    expect(session.next()).toMatchObject({
      phase: "complete",
      currentCard: null,
      answeredCount: 3,
      isComplete: true
    });
  });

  it("starts complete when there are no usable cards", () => {
    const session = createMiniQuizSession([]);

    expect(session.snapshot()).toMatchObject({
      phase: "complete",
      currentCard: null,
      isComplete: true
    });
  });
});
