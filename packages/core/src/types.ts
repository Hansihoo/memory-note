export enum ReviewRating {
  AGAIN = "AGAIN",
  HARD = "HARD",
  GOOD = "GOOD",
  EASY = "EASY"
}

export enum CardStatus {
  NEW = "NEW",
  LEARNING = "LEARNING",
  REVIEW = "REVIEW",
  RELEARNING = "RELEARNING",
  MASTERED = "MASTERED",
  SUSPENDED = "SUSPENDED"
}

export enum CardType {
  BASIC_KEY_TO_VALUE = "BASIC_KEY_TO_VALUE",
  BASIC_VALUE_TO_KEY = "BASIC_VALUE_TO_KEY",
  CLOZE = "CLOZE",
  LISTENING = "LISTENING",
  TYPING = "TYPING",
  SITUATION_RESPONSE = "SITUATION_RESPONSE"
}

export enum StudyPlatform {
  WEB = "WEB",
  EXTENSION = "EXTENSION",
  MOBILE = "MOBILE"
}

export const EXTENSION_REVIEW_RATING_BY_MARK = {
  unknown: ReviewRating.AGAIN,
  know: ReviewRating.GOOD
} as const;

export const BASIC_REVIEW_RATING_BY_ACTION = {
  again: ReviewRating.AGAIN,
  hard: ReviewRating.HARD,
  good: ReviewRating.GOOD
} as const;

export const ADVANCED_REVIEW_RATING_BY_ACTION = {
  again: ReviewRating.AGAIN,
  hard: ReviewRating.HARD,
  good: ReviewRating.GOOD,
  easy: ReviewRating.EASY
} as const;
