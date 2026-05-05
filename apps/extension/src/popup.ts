import {
  createMiniQuizSession,
  type MemoryCard,
  type MiniQuizSession,
  type MiniQuizSnapshot,
  type QuizMark,
} from "@memory-note/core";

import {
  ExtensionAuthMissingError,
  loadDailyQuest,
  loadServerStudyCards,
  submitServerReview,
  type DailyQuestSummary,
} from "./api";
import { createWebAuthUrl, loadExtensionAuth, type WebAuthMode } from "./auth";
import popupStyles from "./popup.css?inline";
import { loadExtensionSettings, recordMiniQuizShown } from "./settings";
import { createExtensionSpeechDriver } from "./speech";
import { enqueuePendingReview, flushPendingReviews } from "./pending-review";

interface MemoryNoteChromeApi {
  runtime?: {
    openOptionsPage(callback?: () => void): void;
  };
  tabs?: {
    create(options: { url: string }): void;
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
const MIN_QUIZ_TEXT_FONT_SIZE = 8;
const MAX_MORE_CARD_FETCH_LIMIT = 50;
const DAILY_QUEST_TARGET_COUNT = 5;
let homeRequestId = 0;

style.textContent = popupStyles;
document.head.append(style);

if (root) {
  renderHome(root);
}

function renderHome(container: HTMLElement): void {
  const requestId = (homeRequestId += 1);
  document.body.classList.remove("login-before-popup");
  document.body.classList.add("start-popup");
  renderQuestDashboard(container);

  void loadExtensionAuth().then((auth) => {
    if (!auth) {
      renderLoginRequired(container);
      return;
    }

    void loadDailyQuest(DAILY_QUEST_TARGET_COUNT, Promise.resolve(auth))
      .then((quest) => {
        if (requestId === homeRequestId) {
          renderQuestDashboard(container, quest.summary);
        }
      })
      .catch(() => {
        if (requestId === homeRequestId) {
          renderQuestDashboard(container, null, "퀘스트 정보를 불러오지 못했어요");
        }
      });
  });
}

function renderQuestDashboard(
  container: HTMLElement,
  summary: DailyQuestSummary | null = null,
  errorMessage = "",
): void {
  const targetCount = Math.max(1, summary?.targetCount ?? DAILY_QUEST_TARGET_COUNT);
  const completedCount = Math.max(0, summary?.completedCount ?? 0);
  const progressRatio = Math.min(100, Math.round((completedCount / targetCount) * 100));
  const progressText = summary ? `${completedCount}/${targetCount} 완료` : "퀘스트를 불러오는 중";
  const questDayText = `${summary?.questDayCount ?? 0}일`;
  const masteredText = `${summary?.masteredCount ?? 0}단어`;
  const helperText =
    errorMessage ||
    (summary?.remainingCount === 0
      ? "오늘 퀘스트를 완료했어요"
      : "오늘 퀘스트를 바로 시작할 수 있어요");

  container.innerHTML = `
    <section class="popup-shell start-shell" aria-labelledby="popup-title">
      <div class="start-card">
        <h1 class="start-title" id="popup-title">Memory Note</h1>
        <p class="start-status">오늘 퀘스트</p>
        <div class="quest-progress" aria-label="오늘 퀘스트 진행률">${progressText}</div>
        <div class="quest-meter" aria-hidden="true">
          <span class="quest-meter-fill" style="width: ${progressRatio}%"></span>
        </div>
        <div class="quest-stats" aria-label="퀘스트 통계">
          <div class="quest-stat">
            <span class="quest-stat-value">${questDayText}</span>
            <span class="quest-stat-label">진행</span>
          </div>
          <div class="quest-stat">
            <span class="quest-stat-value">${masteredText}</span>
            <span class="quest-stat-label">암기</span>
          </div>
        </div>
        <button class="start-primary" type="button" id="start-button">오늘 퀘스트 시작</button>
        <div class="start-actions">
          <button class="start-link-button" type="button" id="options-button">설정</button>
        </div>
        <p class="start-helper${errorMessage ? " error" : ""}" role="status" id="popup-status">${helperText}</p>
      </div>
    </section>
  `;

  const startButton =
    container.querySelector<HTMLButtonElement>("#start-button");
  const optionsButton =
    container.querySelector<HTMLButtonElement>("#options-button");
  const status = container.querySelector<HTMLElement>("#popup-status");

  startButton?.addEventListener("click", () => {
    homeRequestId += 1;
    void startPopupQuiz(container, status);
  });

  optionsButton?.addEventListener("click", () => {
    chromeApi?.runtime?.openOptionsPage();
  });
}

function renderLoginRequired(container: HTMLElement): void {
  document.body.classList.remove("start-popup");
  document.body.classList.add("login-before-popup");
  container.innerHTML = `
    <section class="popup-shell login-shell" aria-labelledby="login-title">
      <div class="login-card">
        <h1 class="login-title" id="login-title">Memory Note</h1>
        <p class="login-status" role="status">확장 프로그램 연결 필요</p>
        <button class="login-primary" type="button" id="login-button">웹에서 로그인</button>
        <div class="login-actions">
          <button class="login-link-button" type="button" id="register-button">회원가입</button>
          <button class="login-link-button" type="button" id="login-options-button">설정</button>
        </div>
        <p class="login-helper">로그인하면 바로 시작됩니다</p>
      </div>
    </section>
  `;

  container
    .querySelector<HTMLButtonElement>("#login-button")
    ?.addEventListener("click", () => {
      openWebAuth("login");
    });

  container
    .querySelector<HTMLButtonElement>("#register-button")
    ?.addEventListener("click", () => {
      openWebAuth("register");
    });

  container
    .querySelector<HTMLButtonElement>("#login-options-button")
    ?.addEventListener("click", () => {
      chromeApi?.runtime?.openOptionsPage();
    });
}

function openWebAuth(mode: WebAuthMode): void {
  chromeApi?.tabs?.create({ url: createWebAuthUrl(mode) });
}

async function startPopupQuiz(
  container: HTMLElement,
  status: HTMLElement | null,
  seenCardIds = new Set<string>(),
): Promise<void> {
  if (status) {
    setStatus(status, "단어를 불러오는 중입니다.");
  } else {
    renderQuizLoading(container, "추가 단어를 불러오는 중입니다.");
  }
  await flushPendingReviews();

  try {
    const settings = await loadExtensionSettings();
    const cards = await loadServerStudyCards(
      getCardFetchLimit(settings.questionsPerRound, seenCardIds.size),
    );
    const nextCards = selectNextRoundCards(
      cards,
      seenCardIds,
      settings.questionsPerRound,
    );
    if (nextCards.length === 0) {
      if (seenCardIds.size > 0) {
        renderNoMoreCards(container, seenCardIds);
        return;
      }
      setStatus(status, "오늘 복습할 카드가 없습니다.", true);
      return;
    }
    const session = createMiniQuizSession(nextCards, {
      maxQuestions: settings.questionsPerRound,
    });

    await recordMiniQuizShown();
    renderQuiz(container, session, session.snapshot(), seenCardIds);
  } catch (error) {
    if (error instanceof ExtensionAuthMissingError) {
      if (status) {
        setStatus(status, "웹 앱에서 로그인한 뒤 다시 눌러주세요.", true);
      } else {
        renderLoginRequired(container);
      }
      return;
    }
    if (status) {
      setStatus(
        status,
        "퀴즈를 시작하지 못했어요. 확장을 다시 로드한 뒤 시도해주세요.",
        true,
      );
      return;
    }
    renderQuizError(container);
  }
}

function renderQuiz(
  container: HTMLElement,
  session: MiniQuizSession,
  snapshot = session.snapshot(),
  seenCardIds = new Set<string>(),
): void {
  document.body.classList.remove("login-before-popup", "start-popup");
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

        if (action === "more") {
          void startPopupQuiz(container, null, seenCardIds);
          return;
        }

        if (action === "restart") {
          renderQuiz(container, session, session.reset(), seenCardIds);
          return;
        }

        if (action === "next") {
          renderQuiz(container, session, session.next(), seenCardIds);
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
          if (currentCardId) {
            seenCardIds.add(currentCardId);
          }
          renderQuiz(container, session, session.answer(mark), seenCardIds);
          if (currentCardId) {
            void submitServerReview(currentCardId, mark).catch(async () => {
              await enqueuePendingReview(currentCardId, mark);
            });
            void flushPendingReviews();
          }
        }
      });
    });

  fitQuizText(container);
}

function createQuizBody(snapshot: MiniQuizSnapshot): string {
  if (snapshot.isComplete) {
    return `
      <div class="quiz-body">
        <p class="complete-title">${snapshot.maxQuestions}개 완료</p>
        <p class="complete-copy">이어서 다른 단어를 더 볼 수 있어요.</p>
        <div class="complete-actions">
          <button class="start-button" type="button" data-action="more">더 풀기</button>
          <button class="options-button" type="button" data-action="restart">다시 풀기</button>
        </div>
        <button class="quiet-button" type="button" data-action="home">처음으로</button>
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

function renderQuizLoading(container: HTMLElement, message: string): void {
  document.body.classList.remove("login-before-popup", "start-popup");
  container.innerHTML = `
    <section class="popup-shell quiz-shell" aria-label="팝업 암기 퀴즈">
      <div class="quiz-body">
        <p class="complete-title">${message}</p>
        <p class="complete-copy">잠시만 기다려주세요.</p>
      </div>
    </section>
  `;
}

function renderQuizError(container: HTMLElement): void {
  document.body.classList.remove("login-before-popup", "start-popup");
  container.innerHTML = `
    <section class="popup-shell quiz-shell" aria-label="팝업 암기 퀴즈">
      <div class="quiz-body">
        <p class="complete-title">퀴즈를 시작하지 못했어요</p>
        <p class="complete-copy">확장을 다시 로드한 뒤 시도해주세요.</p>
        <button class="options-button" type="button" id="error-home-button">처음으로</button>
      </div>
    </section>
  `;
  container
    .querySelector<HTMLButtonElement>("#error-home-button")
    ?.addEventListener("click", () => renderHome(container));
}

function renderNoMoreCards(
  container: HTMLElement,
  seenCardIds: Set<string>,
): void {
  document.body.classList.remove("login-before-popup", "start-popup");
  container.innerHTML = `
    <section class="popup-shell quiz-shell" aria-label="팝업 암기 퀴즈">
      <div class="quiz-body">
        <p class="complete-title">더 볼 단어가 없어요</p>
        <p class="complete-copy">잠시 후 새 복습 카드가 생기면 다시 이어갈 수 있습니다.</p>
        <div class="complete-actions">
          <button class="start-button" type="button" id="retry-more-button">다시 확인</button>
          <button class="options-button" type="button" id="no-more-home-button">처음으로</button>
        </div>
      </div>
    </section>
  `;

  container
    .querySelector<HTMLButtonElement>("#retry-more-button")
    ?.addEventListener("click", () => {
      void startPopupQuiz(container, null, seenCardIds);
    });
  container
    .querySelector<HTMLButtonElement>("#no-more-home-button")
    ?.addEventListener("click", () => renderHome(container));
}

function getCardFetchLimit(questionCount: number, seenCount: number): number {
  if (seenCount <= 0) {
    return questionCount;
  }

  return Math.min(
    MAX_MORE_CARD_FETCH_LIMIT,
    Math.max(questionCount, seenCount + questionCount * 2),
  );
}

function selectNextRoundCards(
  cards: readonly MemoryCard[],
  seenCardIds: ReadonlySet<string>,
  questionCount: number,
): MemoryCard[] {
  return cards
    .filter((card) => !seenCardIds.has(card.id))
    .slice(0, questionCount);
}

function fitQuizText(container: ParentNode): void {
  container
    .querySelectorAll<HTMLElement>(".quiz-prompt, .quiz-answer.revealed")
    .forEach((element) => {
      element.style.fontSize = "";
      const baseFontSize = Number.parseFloat(
        window.getComputedStyle(element).fontSize,
      );
      if (!Number.isFinite(baseFontSize)) {
        return;
      }

      let nextFontSize = Math.floor(baseFontSize);
      while (
        element.scrollWidth > element.clientWidth + 1 &&
        nextFontSize > MIN_QUIZ_TEXT_FONT_SIZE
      ) {
        nextFontSize -= 1;
        element.style.fontSize = `${nextFontSize}px`;
      }
    });
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
