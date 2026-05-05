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

describe("options", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    delete (globalThis as typeof globalThis & { chrome?: unknown }).chrome;
  });

  it("opens web login and registration links", async () => {
    document.body.innerHTML = `<div id="memory-note-options-root"></div>`;
    const createTab = vi.fn();
    (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
      storage: { local: memoryStorage({}) },
      tabs: { create: createTab },
    };

    await import("./options");
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    document.querySelector<HTMLButtonElement>("#options-login-button")?.click();
    expect(createTab).toHaveBeenCalledWith({
      url: "http://localhost:5173/?auth=login&source=extension",
    });

    document
      .querySelector<HTMLButtonElement>("#options-register-button")
      ?.click();
    expect(createTab).toHaveBeenLastCalledWith({
      url: "http://localhost:5173/?auth=register&source=extension",
    });
  });
});
