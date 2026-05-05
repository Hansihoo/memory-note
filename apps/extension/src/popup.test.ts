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

describe("popup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    document.body.className = "";
    document.body.innerHTML = "";
    delete (globalThis as typeof globalThis & { chrome?: unknown }).chrome;
  });

  it("shows the compact start screen when token is present", async () => {
    document.body.innerHTML = `<div id="memory-note-popup-root"></div>`;
    const openOptionsPage = vi.fn();
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
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(document.querySelector(".start-title")?.textContent).toBe("Memory Note");
    expect(document.querySelector(".start-status")?.textContent).toBe(
      "학습 준비 완료",
    );
    expect(document.querySelector("#start-button")?.textContent).toBe("암기 시작");
    expect(document.querySelector(".start-helper")?.textContent).toBe(
      "오늘 복습을 바로 시작합니다",
    );
    expect(document.querySelector(".login-status")).toBeNull();
    expect(document.body.classList.contains("start-popup")).toBe(true);

    document.querySelector<HTMLButtonElement>("#options-button")?.click();
    expect(openOptionsPage).toHaveBeenCalledTimes(1);
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
