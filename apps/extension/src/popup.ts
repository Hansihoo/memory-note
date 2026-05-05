import {
  createMiniQuizSession,
  type MiniQuizSession,
  type MiniQuizSnapshot,
  type QuizMark,
} from "@memory-note/core";

import {
  ExtensionAuthMissingError,
  loadServerStudyCards,
  submitServerReview,
} from "./api";
import { loadExtensionAuth } from "./auth";
import popupStyles from "./popup.css?inline";
import { loadExtensionSettings, recordMiniQuizShown } from "./settings";
import { createExtensionSpeechDriver } from "./speech";
import { enqueuePendingReview, flushPendingReviews } from "./pending-review";

interface MemoryNoteChromeApi {
  runtime?: {
    openOptionsPage(callback?: () => void): void;
  };
}

const root = document.getElementById("memory-note-popup-root");
const style = document.createElement("style");
const chromeApi = (
  globalThis as typeof globalThis & {
    chrome?: MemoryNoteChromeApi;
  }
).chrome;
const speechDriver = createExtensionSpeechDriver();

style.textContent = popupStyles;
document.head.append(style);

if (root) {
  renderHome(root);
}

function renderHome(container: HTMLElement): void {
  container.innerHTML = `
    <section class="popup-shell home-shell" aria-labelledby="popup-title">
      <h1 class="sr-only" id="popup-title">Memory Note Mini Quiz</h1>
      <div class="home-note">
        <button class="start-button" type="button" id="start-button">암기 시작</button>
        <button class="options-button" type="button" id="options-button">설정</button>
      </div>
      <p class="status-text" role="status" id="popup-status"></p>
    </section>
  `;

  const startButton =
    container.querySelector<HTMLButtonElement>("#start-button");
  const optionsButton =
    container.querySelector<HTMLButtonElement>("#options-button");
  const status = container.querySelector<HTMLElement>("#popup-status");

  startButton?.addEventListener("click", () => {
    void startPopupQuiz(container, status);
  });

  optionsButton?.addEventListener("click", () => {
    chromeApi?.runtime?.openOptionsPage();
  });

  void loadExtensionAuth().then((auth) => {
    if (!auth) {
      setStatus(status, "웹 앱에서 로그인하면 확장 프로그램과 연결됩니다.", true);
    }
  });
  void flushPendingReviews();
}

async function startPopupQuiz(
  container: HTMLElement,
  status: HTMLElement | null,
): Promise<void> {
  setStatus(status, "단어를 불러오는 중입니다.");
  await flushPendingReviews();

  try {
    const settings = await loadExtensionSettings();
    const cards = await loadServerStudyCards(settings.questionsPerRound);
    if (cards.length === 0) {
      setStatus(status, "오늘 복습할 카드가 없습니다.", true);
      return;
    }
    const session = createMiniQuizSession(cards, {
      maxQuestions: settings.questionsPerRound,
    });

    await recordMiniQuizShown();
    renderQuiz(container, session);
  } catch (error) {
    if (error instanceof ExtensionAuthMissingError) {
      setStatus(status, "웹 앱에서 로그인한 뒤 다시 눌러주세요.", true);
      return;
    }
    setStatus(
      status,
      "퀴즈를 시작하지 못했어요. 확장을 다시 로드한 뒤 시도해주세요.",
      true,
    );
  }
}

function renderQuiz(
  container: HTMLElement,
  session: MiniQuizSession,
  snapshot = session.snapshot(),
): void {
  container.innerHTML = `
    <section class="popup-shell quiz-shell" aria-label="팝업 암기 퀴즈">
      <header class="quiz-header">
        <span class="quiz-progress">${getProgressText(snapshot)}</span>
      </header>
      ${createQuizBody(snapshot)}
    </section>
  `;

  container
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.action;

        if (action === "home") {
          renderHome(container);
          return;
        }

        if (action === "restart") {
          renderQuiz(container, session, session.reset());
          return;
        }

        if (action === "next") {
          renderQuiz(container, session, session.next());
          return;
        }

        if (action === "speak") {
          speechDriver.speak(button.dataset.speechText ?? "");
          return;
        }

        if (action === "know" || action === "unknown") {
          const snapshot = session.snapshot();
          const currentCardId = snapshot.currentCard?.id;
          const mark = action as QuizMark;
          renderQuiz(container, session, session.answer(mark));
          if (currentCardId) {
            void submitServerReview(currentCardId, mark).catch(async () => {
              await enqueuePendingReview(currentCardId, mark);
            });
            void flushPendingReviews();
          }
        }
      });
    });
}

function createQuizBody(snapshot: MiniQuizSnapshot): string {
  if (snapshot.isComplete) {
    return `
      <div class="quiz-body">
        <p class="complete-title">${snapshot.maxQuestions}개 완료</p>
        <p class="complete-copy">이번 라운드가 끝났습니다.</p>
        <button class="start-button" type="button" data-action="restart">다시 풀기</button>
        <button class="options-button" type="button" data-action="home">처음으로</button>
      </div>
    `;
  }

  if (!snapshot.currentCard) {
    return `
      <div class="quiz-body">
        <p class="complete-title">단어를 불러오지 못했어요</p>
        <button class="options-button" type="button" data-action="home">처음으로</button>
      </div>
    `;
  }

  const answerText =
    snapshot.phase === "answer"
      ? snapshot.currentCard.answer
      : "답을 선택하면 표시됩니다";
  const answerClass =
    snapshot.phase === "answer"
      ? "quiz-answer revealed"
      : "quiz-answer pending";

  return `
    <div class="quiz-body">
      <div class="quiz-note">
        <section class="quiz-note-row">
          ${createTextWithSpeechMarkup({
            className: "quiz-prompt",
            label: "문제 듣기",
            text: snapshot.currentCard.prompt,
          })}
        </section>
        <section class="quiz-note-row">
          ${
            snapshot.phase === "answer"
              ? createTextWithSpeechMarkup({
                  className: answerClass,
                  label: "답 듣기",
                  text: answerText,
                })
              : `<div class="${answerClass}">${escapeHtml(answerText)}</div>`
          }
        </section>
      </div>
      ${
        snapshot.phase === "answer"
          ? createAnswerActionMarkup(snapshot.selectedMark)
          : `<div class="choice-row">
              <button class="choice-button know" type="button" data-action="know" aria-label="알고 있음">O</button>
              <button class="choice-button unknown" type="button" data-action="unknown" aria-label="모름">X</button>
            </div>`
      }
    </div>
  `;
}

function createTextWithSpeechMarkup({
  className,
  label,
  text,
}: {
  className: string;
  label: string;
  text: string;
}): string {
  return `
    <div class="text-with-speech">
      <div class="${className}">${escapeHtml(text)}</div>
      ${createSpeakerButtonMarkup(text, label)}
    </div>
  `;
}

function createSpeakerButtonMarkup(text: string, label: string): string {
  return `
    <button
      class="speak-button"
      type="button"
      data-action="speak"
      data-speech-text="${escapeAttribute(text)}"
      aria-label="${escapeAttribute(label)}"
      title="${escapeAttribute(label)}"
    >
      ${speakerIconMarkup()}
    </button>
  `;
}

function createAnswerActionMarkup(mark: QuizMark | null): string {
  const nextButton = `
    <button class="choice-button next-choice" type="button" data-action="next" aria-label="다음 단어">다음</button>
  `;
  const spacer = `<span class="choice-placeholder" aria-hidden="true"></span>`;

  return `
    <div class="choice-row choice-row-answer" aria-label="${escapeAttribute(getSelectedLabel(mark))}">
      ${mark === "know" ? nextButton : spacer}
      ${mark === "unknown" ? nextButton : spacer}
    </div>
  `;
}

function getProgressText(snapshot: MiniQuizSnapshot): string {
  if (snapshot.isComplete) {
    return `${snapshot.maxQuestions}/${snapshot.maxQuestions}`;
  }

  return `${Math.min(snapshot.answeredCount + 1, snapshot.maxQuestions)}/${snapshot.maxQuestions}`;
}

function getSelectedLabel(mark: QuizMark | null): string {
  if (mark === "know") {
    return "O 선택";
  }

  if (mark === "unknown") {
    return "X 선택";
  }

  return "답 확인";
}

function setStatus(
  status: HTMLElement | null,
  message: string,
  isError = false,
): void {
  if (!status) {
    return;
  }

  status.textContent = message;
  status.classList.toggle("error", isError);
}

function escapeHtml(value: string): string {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function speakerIconMarkup(): string {
  return `
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M11 5 6 9H3v6h3l5 4V5Z"></path>
      <path d="M15.5 8.5a5 5 0 0 1 0 7"></path>
      <path d="M18.5 5.5a9 9 0 0 1 0 13"></path>
    </svg>
  `;
}
