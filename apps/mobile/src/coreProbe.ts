import {
  CardType,
  ReviewRating,
  StudyPlatform,
  createStudySessionFromTodayCards,
  getCurrentStudyCard,
  type TodayCard
} from "@memory-note/core";

export function mobileCoreProbe() {
  const cards: TodayCard[] = [
    {
      cardId: "card-1",
      memoryItemId: "item-1",
      legacyWordId: null,
      wordbookId: "book-1",
      cardType: CardType.BASIC_KEY_TO_VALUE,
      prompt: "hello",
      answer: "안녕"
    }
  ];
  const session = createStudySessionFromTodayCards(cards);
  const current = getCurrentStudyCard(session);

  return {
    platform: StudyPlatform.MOBILE,
    defaultRating: ReviewRating.GOOD,
    prompt: current?.prompt ?? null
  };
}
