import { describe, expect, it } from "vitest";

import {
  EXTENSION_CARDS_STORAGE_KEY,
  loadExtensionCards,
  normalizeStoredCards,
  type ExtensionStorageArea,
} from "./cards";

describe("extension cards", () => {
  it("falls back to default cards when storage is empty", () => {
    expect(normalizeStoredCards(undefined)).toHaveLength(5);
  });

  it("accepts prompt/answer cards", () => {
    const cards = normalizeStoredCards([
      { id: "one", prompt: "passport", answer: "여권" },
    ]);

    expect(cards).toEqual([
      {
        id: "one",
        prompt: "passport",
        answer: "여권",
        source: "extension-storage",
      },
    ]);
  });

  it("accepts key/value cards from the web model shape", () => {
    const cards = normalizeStoredCards([
      { id: "word-1", key: "receipt", value: "영수증", wordbookId: "book-1" },
    ]);

    expect(cards).toEqual([
      {
        id: "word-1",
        prompt: "receipt",
        answer: "영수증",
        source: "book-1",
      },
    ]);
  });

  it("loads cards from chrome storage compatible readers", async () => {
    const storage: ExtensionStorageArea = {
      get(_key, callback) {
        callback({
          [EXTENSION_CARDS_STORAGE_KEY]: [
            { id: "one", prompt: "departure", answer: "출발" },
          ],
        });
      },
      set(_items, callback) {
        callback?.();
      },
    };

    await expect(loadExtensionCards(storage)).resolves.toMatchObject([
      { id: "one", prompt: "departure", answer: "출발" },
    ]);
  });
});
