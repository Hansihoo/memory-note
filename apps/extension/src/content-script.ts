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
import { saveExtensionAuth } from "./auth";
import styles from "./content-script.css?inline";
import {
  consumeMiniQuizStartRequest,
  getDelayUntilNextQuiz,
  loadExtensionSettings,
  loadLastShownAt,
  recordMiniQuizShown,
} from "./settings";
import { createExtensionSpeechDriver } from "./speech";

const ROOT_ID = "memory-note-mini-quiz-root";
const UI_VERSION = "note-speech-layout-v4";
const AUTO_HIDE_DELAY_MS = 2400;
const MAX_TIMER_DELAY_MS = 2_147_000_000;
const MIN_QUIZ_TEXT_FONT_SIZE = 8;

let autoHideTimer: number | undefined;
let nextQuizTimer: number | undefined;
const speechDriver = createExtensionSpeechDriver();

async function bootstrapMiniQuiz(): Promise<void> {
  const forceStart = await consumeMiniQuizStartRequest();
  const existingRoot = document.getElementById(ROOT_ID) as HTMLElement | null;

  if (existingRoot) {
    if (
      existingRoot.dataset.memoryNoteUiVersion === UI_VERSION &&
      !forceStart
    ) {
      return;
    }

    existingRoot.remove();
  }

  window.clearTimeout(autoHideTimer);
  window.clearTimeout(nextQuizTimer);

  const [settings, lastShownAt] = await Promise.all([
    loadExtensionSettings(),
    loadLastShownAt(),
  ]);
  const delayMs = forceStart ? 0 : getDelayUntilNextQuiz(settings, lastShownAt);

  if (delayMs > 0) {
    scheduleNextMiniQuiz(delayMs);
    return;
  }

  await startOverlayQuiz();
}

async function startOverlayQuiz(): Promise<void> {
  document.getElementById(ROOT_ID)?.remove();
  window.clearTimeout(autoHideTimer);

  const settings = await loadExtensionSettings();
  let cards;
  try {
    cards = await loadServerStudyCards(settings.questionsPerRound);
  } catch (error) {
    if (error instanceof ExtensionAuthMissingError) {
      return;
    }
    return;
  }

  if (cards.length === 0) {
    return;
  }

  const session = createMiniQuizSession(cards, {
    maxQuestions: settings.questionsPerRound,
  });

  renderOverlay(session);
  await recordMiniQuizShown();
}

function scheduleNextMiniQuiz(delayMs: number): void {
  window.clearTimeout(nextQuizTimer);
  nextQuizTimer = window.setTimeout(
    () => {
      void bootstrapMiniQuiz();
    },
    Math.min(delayMs, MAX_TIMER_DELAY_MS),
  );
}

function createHost(): { host: HTMLDivElement; shell: HTMLElement } {
  const host = document.createElement("div");
  host.id = ROOT_ID;
  host.dataset.memoryNoteUiVersion = UI_VERSION;

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = styles;

  const shell = document.createElement("section");
  shell.className = "mnq-shell";

  shadow.append(style, shell);
  document.documentElement.append(host);

  return { host, shell };
}

function watchForLegacyMiniQuizRoots(): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (
          node instanceof HTMLElement &&
          node.id === ROOT_ID &&
          node.dataset.memoryNoteUiVersion !== UI_VERSION
        ) {
          node.remove();
          window.setTimeout(() => {
            void bootstrapMiniQuiz();
          }, 0);
        }
      });
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
  });
}

function renderReminder(questionCount: number): void {
  const { host, shell } = createHost();
  shell.classList.add("mnq-reminder");
  shell.setAttribute("aria-label", "암기 풀이 알림");
  shell.innerHTML = `
    <button class="mnq-close" type="button" data-action="close" aria-label="알림 닫기">×</button>
    <button class="mnq-reminder-button" type="button" data-action="start">
      <strong>암기 풀 시간이에요</strong>
      <span>${questionCount}개만 가볍게 풀기</span>
    </button>
  `;

  bindReminderActions(shell, host);
}

function bindReminderActions(shell: HTMLElement, host: HTMLElement): void {
  shell
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.action;

        if (action === "close") {
          void recordMiniQuizShown();
          host.remove();
          return;
        }

        if (action === "start") {
          void startOverlayQuiz();
        }
      });
    });
}

function renderOverlay(session: MiniQuizSession): void {
  const { host, shell } = createHost();
  shell.setAttribute("aria-label", "미니 암기 퀴즈");

  const update = (snapshot = session.snapshot()) => {
    shell.innerHTML = createShellMarkup(snapshot);
    bindActions(shell, session, update, host);
    fitQuizText(shell);

    if (snapshot.isComplete) {
      window.clearTimeout(autoHideTimer);
      autoHideTimer = window.setTimeout(() => {
        host.remove();
      }, AUTO_HIDE_DELAY_MS);
    }
  };

  update();
}

function bindActions(
  shell: HTMLElement,
  session: MiniQuizSession,
  update: (snapshot?: MiniQuizSnapshot) => void,
  host: HTMLElement,
): void {
  shell
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.action;

        if (action === "close") {
          host.remove();
          return;
        }

        if (action === "next") {
          update(session.next());
          return;
        }

        if (action === "restart") {
          window.clearTimeout(autoHideTimer);
          update(session.reset());
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
          update(session.answer(mark));
          if (currentCardId) {
            void submitServerReview(currentCardId, mark).catch(() => undefined);
          }
        }
      });
    });
}

function createShellMarkup(snapshot: MiniQuizSnapshot): string {
  const progress = snapshot.isComplete
    ? `${snapshot.maxQuestions}/${snapshot.maxQuestions}`
    : `${Math.min(snapshot.answeredCount + 1, snapshot.maxQuestions)}/${snapshot.maxQuestions}`;

  return `
    <header class="mnq-header">
      <div class="mnq-progress">${progress}</div>
      <button class="mnq-close" type="button" data-action="close" aria-label="미니 퀴즈 닫기">×</button>
    </header>
    <div class="mnq-body">
      ${createBodyMarkup(snapshot)}
    </div>
  `;
}

function createBodyMarkup(snapshot: MiniQuizSnapshot): string {
  if (snapshot.isComplete) {
    return `
      <p class="mnq-complete-title">${snapshot.maxQuestions}개 완료</p>
      <p class="mnq-complete-copy">잠시 후 자동으로 사라집니다.</p>
      <div class="mnq-footer">
        <span class="mnq-selected">라운드 종료</span>
        <button class="mnq-restart" type="button" data-action="restart">다시 풀기</button>
      </div>
    `;
  }

  if (!snapshot.currentCard) {
    return `
      <p class="mnq-complete-title">단어를 불러오지 못했어요</p>
      <p class="mnq-complete-copy">저장된 단어가 없으면 기본 예시 단어로 다시 시도합니다.</p>
    `;
  }

  const answerText =
    snapshot.phase === "answer"
      ? snapshot.currentCard.answer
      : "답을 선택하면 표시됩니다";
  const answerClass =
    snapshot.phase === "answer" ? "mnq-answer revealed" : "mnq-answer pending";

  return `
    <div class="mnq-note">
      <section class="mnq-note-row mnq-question-row">
        ${createTextWithSpeechMarkup({
          className: "mnq-prompt",
          label: "문제 듣기",
          text: snapshot.currentCard.prompt,
        })}
      </section>
      <section class="mnq-note-row mnq-answer-row">
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
        : `<div class="mnq-choice-row">
            <button class="mnq-choice" type="button" data-action="know" data-mark="know" aria-label="알고 있음">O</button>
            <button class="mnq-choice" type="button" data-action="unknown" data-mark="unknown" aria-label="모름">X</button>
          </div>`
    }
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
    <div class="mnq-text-with-speech">
      <div class="${className}">${escapeHtml(text)}</div>
      ${createSpeakerButtonMarkup(text, label)}
    </div>
  `;
}

function createSpeakerButtonMarkup(text: string, label: string): string {
  return `
    <button
      class="mnq-speak"
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
    <button class="mnq-choice mnq-next-choice" type="button" data-action="next" aria-label="다음 단어">다음</button>
  `;
  const spacer = `<span class="mnq-choice-placeholder" aria-hidden="true"></span>`;

  return `
    <div class="mnq-choice-row mnq-choice-row-answer" aria-label="${escapeAttribute(getSelectedLabel(mark))}">
      ${mark === "know" ? nextButton : spacer}
      ${mark === "unknown" ? nextButton : spacer}
    </div>
  `;
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

function fitQuizText(container: ParentNode): void {
  container
    .querySelectorAll<HTMLElement>(".mnq-prompt, .mnq-answer.revealed")
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

function listenForWebAuthToken(): void {
  window.addEventListener("message", (event) => {
    if (event.source !== window || !isRecord(event.data)) {
      return;
    }

    const data = event.data;
    if (
      data.source !== "memory-note-web" ||
      data.type !== "MEMORY_NOTE_AUTH_TOKEN" ||
      typeof data.token !== "string"
    ) {
      return;
    }

    void saveExtensionAuth({
      token: data.token,
      apiBaseUrl: typeof data.apiBaseUrl === "string" ? data.apiBaseUrl : undefined,
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

listenForWebAuthToken();
watchForLegacyMiniQuizRoots();
void bootstrapMiniQuiz();
