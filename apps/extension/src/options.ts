import optionsStyles from "./options.css?inline";
import { createWebAuthUrl, loadExtensionAuth, type WebAuthMode } from "./auth";
import {
  INTERVAL_HOUR_OPTIONS,
  QUESTIONS_PER_ROUND_OPTIONS,
  loadExtensionSettings,
  resetMiniQuizSchedule,
  saveExtensionSettings,
} from "./settings";

interface MemoryNoteChromeApi {
  tabs?: {
    create(options: { url: string }): void;
  };
}

const root = document.getElementById("memory-note-options-root");
const style = document.createElement("style");
const chromeApi = (
  globalThis as typeof globalThis & {
    chrome?: MemoryNoteChromeApi;
  }
).chrome;

style.textContent = optionsStyles;
document.head.append(style);

if (root) {
  void renderOptions(root);
}

async function renderOptions(container: HTMLElement): Promise<void> {
  const [settings, auth] = await Promise.all([
    loadExtensionSettings(),
    loadExtensionAuth(),
  ]);

  container.innerHTML = `
    <section class="options-shell" aria-labelledby="options-title">
      <h1 class="options-title" id="options-title">암기 노트 설정</h1>
      <p class="options-copy">
        웹페이지를 보는 중 암기 풀이 알림이 나타나는 간격과 한 번에 풀 단어 수를 정합니다.
      </p>

      <section class="settings-panel account-panel" aria-labelledby="account-title">
        <div>
          <h2 class="panel-title" id="account-title">계정 연결</h2>
          <p class="panel-copy">
            ${auth ? "웹 계정과 연결되어 있습니다." : "웹에서 로그인하거나 가입하면 확장 프로그램이 같은 계정을 사용합니다."}
          </p>
        </div>
        <div class="auth-action-row">
          <button class="auth-button primary-auth-button" type="button" id="options-login-button">웹에서 로그인</button>
          <button class="auth-button" type="button" id="options-register-button">회원가입</button>
        </div>
      </section>

      <form class="settings-panel" id="settings-form">
        <label class="setting-row" for="interval-hours">
          <span>
            <span class="setting-label">표시 간격</span>
            <span class="setting-hint">마지막 알림 또는 퀴즈 뒤 얼마 후 다시 알려줄지 정합니다.</span>
          </span>
          <select class="setting-select" id="interval-hours" name="intervalHours">
            ${createOptionsMarkup(INTERVAL_HOUR_OPTIONS, settings.intervalHours, "시간마다")}
          </select>
        </label>

        <label class="setting-row" for="questions-per-round">
          <span>
            <span class="setting-label">단어 수</span>
            <span class="setting-hint">한 번 풀 때 몇 개 단어를 물어볼지 정합니다.</span>
          </span>
          <select class="setting-select" id="questions-per-round" name="questionsPerRound">
            ${createOptionsMarkup(QUESTIONS_PER_ROUND_OPTIONS, settings.questionsPerRound, "개씩")}
          </select>
        </label>

        <div class="setting-actions">
          <p class="status-text" role="status" id="settings-status"></p>
          <button class="test-button" type="button" id="test-now-button">지금 바로 테스트</button>
          <button class="save-button" type="submit">저장</button>
        </div>
      </form>
    </section>
  `;

  const form = container.querySelector<HTMLFormElement>("#settings-form");
  const intervalSelect =
    container.querySelector<HTMLSelectElement>("#interval-hours");
  const questionsSelect = container.querySelector<HTMLSelectElement>(
    "#questions-per-round",
  );
  const status = container.querySelector<HTMLElement>("#settings-status");
  const testNowButton =
    container.querySelector<HTMLButtonElement>("#test-now-button");
  const loginButton =
    container.querySelector<HTMLButtonElement>("#options-login-button");
  const registerButton =
    container.querySelector<HTMLButtonElement>("#options-register-button");

  loginButton?.addEventListener("click", () => {
    openWebAuth("login");
  });

  registerButton?.addEventListener("click", () => {
    openWebAuth("register");
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();

    void saveExtensionSettings({
      intervalHours: Number(intervalSelect?.value),
      questionsPerRound: Number(questionsSelect?.value),
    }).then((savedSettings) => {
      if (!status) {
        return;
      }

      status.textContent = `${savedSettings.intervalHours}시간마다 ${savedSettings.questionsPerRound}개씩 저장됐어요.`;
    });
  });

  testNowButton?.addEventListener("click", () => {
    void resetMiniQuizSchedule().then(() => {
      if (!status) {
        return;
      }

      status.textContent =
        "표시 기록을 초기화했어요. 웹페이지를 새로고침하면 바로 뜹니다.";
    });
  });
}

function openWebAuth(mode: WebAuthMode): void {
  chromeApi?.tabs?.create({ url: createWebAuthUrl(mode) });
}

function createOptionsMarkup(
  options: readonly number[],
  selectedValue: number,
  suffix: string,
): string {
  return options
    .map((option) => {
      const selected = option === selectedValue ? " selected" : "";

      return `<option value="${option}"${selected}>${option}${suffix}</option>`;
    })
    .join("");
}
