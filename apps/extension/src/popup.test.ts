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
    document.body.innerHTML = "";
    delete (globalThis as typeof globalThis & { chrome?: unknown }).chrome;
  });

  it("shows a connection guide when token is missing", async () => {
    document.body.innerHTML = `<div id="memory-note-popup-root"></div>`;
    (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
      storage: { local: memoryStorage({}) },
      runtime: { openOptionsPage: vi.fn() },
    };

    await import("./popup");
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(document.querySelector("#popup-status")?.textContent).toContain("로그인");
  });
});
