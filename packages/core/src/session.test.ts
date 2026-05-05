import { describe, expect, it } from "vitest";
import { CardType, ReviewRating, StudyPlatform } from "./types";
import {
  advanceStudySession,
  cardTypeFromDirection,
  createPendingReviewEvent,
  createStudySessionFromTodayCards,
  directionFromCardType,
  getCurrentStudyCard,
  revealStudySession
} from "./session";

describe("shared study session engine", () => {
  it("creates and advances a session from today cards", () => {
    const session = createStudySessionFromTodayCards([
      {
        cardId: "10",
        memoryItemId: "20",
        legacyWordId: "30",
        wordbookId: "40",
        cardType: CardType.BASIC_VALUE_TO_KEY,
        prompt: "여권",
        answer: "passport"
      }
    ]);

    expect(getCurrentStudyCard(session)).toMatchObject({
      cardId: "10",
      direction: "value-to-key",
      prompt: "여권",
      answer: "passport"
    });
    expect(revealStudySession(session).revealed).toBe(true);
    expect(getCurrentStudyCard(advanceStudySession(session))).toBeNull();
  });

  it("maps card types and builds pending review events", () => {
    expect(cardTypeFromDirection("key-to-value")).toBe(CardType.BASIC_KEY_TO_VALUE);
    expect(directionFromCardType(CardType.CLOZE)).toBe("key-to-value");
    expect(createPendingReviewEvent({
      cardId: "1",
      rating: ReviewRating.GOOD,
      platform: StudyPlatform.EXTENSION,
      clientEventId: "event-1",
      reviewedAt: "2026-05-05T00:00:00.000Z"
    })).toEqual({
      cardId: "1",
      rating: ReviewRating.GOOD,
      platform: StudyPlatform.EXTENSION,
      clientEventId: "event-1",
      reviewedAt: "2026-05-05T00:00:00.000Z",
      attemptCount: 0,
      lastAttemptAt: null
    });
  });
});
