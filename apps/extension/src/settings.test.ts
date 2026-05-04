import { describe, expect, it } from "vitest";

import {
  EXTENSION_LAST_SHOWN_AT_STORAGE_KEY,
  EXTENSION_FORCE_START_STORAGE_KEY,
  EXTENSION_SETTINGS_STORAGE_KEY,
  DEFAULT_EXTENSION_SETTINGS,
  consumeMiniQuizStartRequest,
  getDelayUntilNextQuiz,
  loadExtensionSettings,
  loadLastShownAt,
  normalizeExtensionSettings,
  recordMiniQuizShown,
  requestMiniQuizStart,
  resetMiniQuizSchedule,
  saveExtensionSettings,
} from "./settings";
import type { ExtensionStorageArea } from "./storage";

describe("extension settings", () => {
  it("normalizes supported options", () => {
    expect(
      normalizeExtensionSettings({
        intervalHours: "6",
        questionsPerRound: "15",
      }),
    ).toEqual({
      intervalHours: 6,
      questionsPerRound: 15,
    });
  });

  it("falls back when settings are unsupported", () => {
    expect(
      normalizeExtensionSettings({
        intervalHours: 99,
        questionsPerRound: 999,
      }),
    ).toEqual(DEFAULT_EXTENSION_SETTINGS);
  });

  it("defaults to one hour and five questions", () => {
    expect(DEFAULT_EXTENSION_SETTINGS).toEqual({
      intervalHours: 1,
      questionsPerRound: 5,
    });
  });

  it("calculates the remaining delay before the next quiz", () => {
    expect(
      getDelayUntilNextQuiz(
        { intervalHours: 1, questionsPerRound: 5 },
        null,
        1_000,
      ),
    ).toBe(60 * 60 * 1000);

    expect(
      getDelayUntilNextQuiz(
        { intervalHours: 1, questionsPerRound: 5 },
        0,
        1_000,
      ),
    ).toBe(0);

    expect(
      getDelayUntilNextQuiz(
        { intervalHours: 3, questionsPerRound: 10 },
        1_000,
        1_000 + 60 * 60 * 1000,
      ),
    ).toBe(2 * 60 * 60 * 1000);

    expect(
      getDelayUntilNextQuiz(
        { intervalHours: 3, questionsPerRound: 10 },
        1_000,
        1_000 + 3 * 60 * 60 * 1000,
      ),
    ).toBe(0);
  });

  it("loads and saves settings through chrome storage compatible readers", async () => {
    const state: Record<string, unknown> = {};
    const storage: ExtensionStorageArea = {
      get(key, callback) {
        callback({ [String(key)]: state[String(key)] });
      },
      set(items, callback) {
        Object.assign(state, items);
        callback?.();
      },
    };

    await expect(
      saveExtensionSettings(
        { intervalHours: 12, questionsPerRound: 20 },
        storage,
      ),
    ).resolves.toEqual({ intervalHours: 12, questionsPerRound: 20 });

    expect(state[EXTENSION_SETTINGS_STORAGE_KEY]).toEqual({
      intervalHours: 12,
      questionsPerRound: 20,
    });

    await expect(loadExtensionSettings(storage)).resolves.toEqual({
      intervalHours: 12,
      questionsPerRound: 20,
    });
  });

  it("stores and loads last shown time", async () => {
    const state: Record<string, unknown> = {};
    const storage: ExtensionStorageArea = {
      get(key, callback) {
        callback({ [String(key)]: state[String(key)] });
      },
      set(items, callback) {
        Object.assign(state, items);
        callback?.();
      },
    };

    await recordMiniQuizShown(1234, storage);

    expect(state[EXTENSION_LAST_SHOWN_AT_STORAGE_KEY]).toBe(1234);
    await expect(loadLastShownAt(storage)).resolves.toBe(1234);
  });

  it("resets the quiz schedule for immediate testing", async () => {
    const state: Record<string, unknown> = {
      [EXTENSION_LAST_SHOWN_AT_STORAGE_KEY]: 1234,
    };
    const storage: ExtensionStorageArea = {
      get(key, callback) {
        callback({ [String(key)]: state[String(key)] });
      },
      set(items, callback) {
        Object.assign(state, items);
        callback?.();
      },
    };

    await resetMiniQuizSchedule(storage);

    expect(state[EXTENSION_LAST_SHOWN_AT_STORAGE_KEY]).toBe(0);
    await expect(loadLastShownAt(storage)).resolves.toBe(0);
  });

  it("requests and consumes a manual quiz start", async () => {
    const state: Record<string, unknown> = {};
    const storage: ExtensionStorageArea = {
      get(key, callback) {
        callback({ [String(key)]: state[String(key)] });
      },
      set(items, callback) {
        Object.assign(state, items);
        callback?.();
      },
    };

    await requestMiniQuizStart(5678, storage);

    expect(state[EXTENSION_FORCE_START_STORAGE_KEY]).toBe(5678);
    expect(state[EXTENSION_LAST_SHOWN_AT_STORAGE_KEY]).toBe(0);
    await expect(consumeMiniQuizStartRequest(storage)).resolves.toBe(true);
    expect(state[EXTENSION_FORCE_START_STORAGE_KEY]).toBe(0);
    await expect(consumeMiniQuizStartRequest(storage)).resolves.toBe(false);
  });
});
