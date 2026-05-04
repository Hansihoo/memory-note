import { describe, expect, it } from "vitest";
import {
  ADVANCED_REVIEW_RATING_BY_ACTION,
  BASIC_REVIEW_RATING_BY_ACTION,
  CardStatus,
  CardType,
  EXTENSION_REVIEW_RATING_BY_MARK,
  ReviewRating,
  StudyPlatform
} from "./types";

describe("shared study types", () => {
  it("keeps enum values stable for API contracts", () => {
    expect(Object.values(ReviewRating)).toEqual(["AGAIN", "HARD", "GOOD", "EASY"]);
    expect(Object.values(CardStatus)).toEqual(["NEW", "LEARNING", "REVIEW", "RELEARNING", "MASTERED", "SUSPENDED"]);
    expect(Object.values(CardType)).toEqual([
      "BASIC_KEY_TO_VALUE",
      "BASIC_VALUE_TO_KEY",
      "CLOZE",
      "LISTENING",
      "TYPING",
      "SITUATION_RESPONSE"
    ]);
    expect(Object.values(StudyPlatform)).toEqual(["WEB", "EXTENSION", "MOBILE"]);
  });

  it("maps default button choices to review ratings", () => {
    expect(EXTENSION_REVIEW_RATING_BY_MARK).toEqual({
      unknown: ReviewRating.AGAIN,
      know: ReviewRating.GOOD
    });
    expect(BASIC_REVIEW_RATING_BY_ACTION).toEqual({
      again: ReviewRating.AGAIN,
      hard: ReviewRating.HARD,
      good: ReviewRating.GOOD
    });
    expect(ADVANCED_REVIEW_RATING_BY_ACTION.easy).toBe(ReviewRating.EASY);
  });
});
