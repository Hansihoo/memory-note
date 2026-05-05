import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExtensionStorageArea } from "./storage";

function memoryStorage(state: Record<string, unknown>): ExtensionStorageArea {
  return {
    get(key, callback) {
      callback(typeof key === "string" ? { [key]: state[key] } : state);
    },
    set(items, callback) {
      Object.assign(state, items);
      callback?.();
    },
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
      ...init,
    }),
  );
}

async function waitForElementText(selector: string, text: string): Promise<void> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    if (document.querySelector(selector)?.textContent === text) {
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  throw new Error(`Expected ${selector} to contain ${text}`);
}

describe("popup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    document.body.className = "";
    document.body.innerHTML = "";
    delete (globalThis as typeof globalThis & { chrome?: unknown }).chrome;
  });

  it("shows daily quest progress before starting a quiz and can load more cards", async () => {
    document.body.innerHTML = `<div id="memory-note-popup-root"></div>`;
    const openOptionsPage = vi.fn();
    const cards = Array.from({ length: 10 }, (_, index) => ({
      cardId: index + 1,
      memoryItemId: index + 101,
      wordbookId: 1,
      cardType: "BASIC_KEY_TO_VALUE",
      prompt: `word-${index + 1}`,
      answer: `answer-${index + 1}`,
      status: "NEW",
      dueAt: "2026-05-05T00:00:00Z",
      lapses: 0,
      leechScore: 0,
    }));
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/study/daily-quest") {
        return jsonResponse({
          summary: {
            questDate: "2026-05-05",
            targetCount: 25,
            completedCount: 2,
            remainingCount: 23,
            questDayCount: 7,
            masteredCount: 12,
            todayStudiedCount: 2,
            estimatedMinutes: 2,
          },
          cards: cards.slice(0, 5),
        });
      }
      if (url.pathname === "/study/today") {
        const limit = Number(url.searchParams.get("limit") ?? 5);
        return jsonResponse({ cards: cards.slice(0, limit) });
      }
      if (url.pathname.startsWith("/study/cards/") && init?.method === "POST") {
        return jsonResponse({});
      }
      return jsonResponse({});
    });
    (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
      storage: {
        local: memoryStorage({
          "memoryNote.extension.auth.v1": {
            token: "token-1",
            apiBaseUrl: "http://localhost:8000",
            updatedAt: 1234,
          },
        }),
      },
      runtime: { openOptionsPage },
    };

    await import("./popup");
    await waitForElementText(".quest-progress", "2/25 완료");

    expect(document.querySelector(".login-status")).toBeNull();
    expect(document.querySelector(".quest-stats")?.textContent).toContain("7일");
    expect(document.querySelector(".quest-stats")?.textContent).toContain("12단어");
    expect(document.body.classList.contains("start-popup")).toBe(true);

    document.querySelector<HTMLButtonElement>("#start-button")?.click();
    await waitForElementText(".quiz-prompt", "word-1");

    expect(document.body.classList.contains("start-popup")).toBe(false);

    for (let index = 0; index < 5; index += 1) {
      document.querySelector<HTMLButtonElement>(".choice-button.know")?.click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      document.querySelector<HTMLButtonElement>("[data-action='next']")?.click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    expect(document.querySelector("[data-action='more']")?.textContent).toBe(
      "더 풀기",
    );

    document.querySelector<HTMLButtonElement>("[data-action='more']")?.click();
    await waitForElementText(".quiz-prompt", "word-6");
    expect(openOptionsPage).not.toHaveBeenCalled();
  });

  it("shows the compact web login state when token is missing", async () => {
    document.body.innerHTML = `<div id="memory-note-popup-root"></div>`;
    const createTab = vi.fn();
    const openOptionsPage = vi.fn();
    (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
      storage: { local: memoryStorage({}) },
      runtime: { openOptionsPage },
      tabs: { create: createTab },
    };

    await import("./popup");
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(document.querySelector(".login-title")?.textContent).toBe("Memory Note");
    expect(document.querySelector(".login-status")?.textContent).toBe(
      "확장 프로그램 연결 필요",
    );
    expect(document.querySelector(".login-helper")?.textContent).toBe(
      "로그인하면 바로 시작됩니다",
    );
    expect(document.querySelector("#start-button")).toBeNull();
    expect(document.querySelector("#popup-status")).toBeNull();
    expect(document.body.classList.contains("login-before-popup")).toBe(true);

    document.querySelector<HTMLButtonElement>("#login-button")?.click();
    expect(createTab).toHaveBeenCalledWith({
      url: "https://memory-note-web.vercel.app/?auth=login&source=extension",
    });

    document.querySelector<HTMLButtonElement>("#register-button")?.click();
    expect(createTab).toHaveBeenLastCalledWith({
      url: "https://memory-note-web.vercel.app/?auth=register&source=extension",
    });

    document.querySelector<HTMLButtonElement>("#login-options-button")?.click();
    expect(openOptionsPage).toHaveBeenCalledTimes(1);
  });
});
