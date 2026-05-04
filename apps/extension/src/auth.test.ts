import { describe, expect, it } from "vitest";

import {
  EXTENSION_AUTH_STORAGE_KEY,
  loadExtensionAuth,
  normalizeApiBaseUrl,
  saveExtensionAuth,
} from "./auth";
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

describe("extension auth", () => {
  it("saves and loads web auth tokens through chrome storage", async () => {
    const state: Record<string, unknown> = {};
    const storage = memoryStorage(state);

    await expect(
      saveExtensionAuth(
        {
          token: "token-1",
          apiBaseUrl: "http://localhost:8000/",
          updatedAt: 1234,
        },
        storage,
      ),
    ).resolves.toEqual({
      token: "token-1",
      apiBaseUrl: "http://localhost:8000",
      updatedAt: 1234,
    });

    expect(state[EXTENSION_AUTH_STORAGE_KEY]).toEqual({
      token: "token-1",
      apiBaseUrl: "http://localhost:8000",
      updatedAt: 1234,
    });
    await expect(loadExtensionAuth(storage)).resolves.toEqual({
      token: "token-1",
      apiBaseUrl: "http://localhost:8000",
      updatedAt: 1234,
    });
  });

  it("normalizes empty api base urls", () => {
    expect(normalizeApiBaseUrl("")).toBe("http://localhost:8000");
  });
});
