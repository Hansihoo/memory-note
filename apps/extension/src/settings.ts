import { readChromeLocalStorage, type ExtensionStorageArea } from "./storage";

export const EXTENSION_SETTINGS_STORAGE_KEY =
  "memoryNote.extension.settings.v1";
export const EXTENSION_LAST_SHOWN_AT_STORAGE_KEY =
  "memoryNote.extension.lastShownAt.v1";
export const EXTENSION_FORCE_START_STORAGE_KEY =
  "memoryNote.extension.forceStartAt.v1";

export const INTERVAL_HOUR_OPTIONS = [1, 2, 3, 6, 12, 24] as const;
export const QUESTIONS_PER_ROUND_OPTIONS = [3, 5, 10, 15, 20] as const;

export interface ExtensionSettings {
  intervalHours: number;
  questionsPerRound: number;
}

export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
  intervalHours: 1,
  questionsPerRound: 5,
};

export async function loadExtensionSettings(
  storage = readChromeLocalStorage(),
): Promise<ExtensionSettings> {
  if (!storage) {
    return DEFAULT_EXTENSION_SETTINGS;
  }

  return new Promise((resolve) => {
    storage.get(EXTENSION_SETTINGS_STORAGE_KEY, (items) => {
      resolve(
        normalizeExtensionSettings(items[EXTENSION_SETTINGS_STORAGE_KEY]),
      );
    });
  });
}

export async function saveExtensionSettings(
  settings: ExtensionSettings,
  storage = readChromeLocalStorage(),
): Promise<ExtensionSettings> {
  const normalizedSettings = normalizeExtensionSettings(settings);

  if (!storage) {
    return normalizedSettings;
  }

  return new Promise((resolve) => {
    storage.set(
      {
        [EXTENSION_SETTINGS_STORAGE_KEY]: normalizedSettings,
      },
      () => resolve(normalizedSettings),
    );
  });
}

export async function loadLastShownAt(
  storage = readChromeLocalStorage(),
): Promise<number | null> {
  if (!storage) {
    return null;
  }

  return new Promise((resolve) => {
    storage.get(EXTENSION_LAST_SHOWN_AT_STORAGE_KEY, (items) => {
      const value = items[EXTENSION_LAST_SHOWN_AT_STORAGE_KEY];
      resolve(
        typeof value === "number" && Number.isFinite(value) ? value : null,
      );
    });
  });
}

export async function recordMiniQuizShown(
  shownAt = Date.now(),
  storage = readChromeLocalStorage(),
): Promise<void> {
  if (!storage) {
    return;
  }

  return new Promise((resolve) => {
    storage.set(
      {
        [EXTENSION_LAST_SHOWN_AT_STORAGE_KEY]: shownAt,
      },
      resolve,
    );
  });
}

export async function resetMiniQuizSchedule(
  storage = readChromeLocalStorage(),
): Promise<void> {
  if (!storage) {
    return;
  }

  return new Promise((resolve) => {
    storage.set(
      {
        [EXTENSION_LAST_SHOWN_AT_STORAGE_KEY]: 0,
      },
      resolve,
    );
  });
}

export async function requestMiniQuizStart(
  requestedAt = Date.now(),
  storage = readChromeLocalStorage(),
): Promise<void> {
  if (!storage) {
    return;
  }

  return new Promise((resolve) => {
    storage.set(
      {
        [EXTENSION_FORCE_START_STORAGE_KEY]: requestedAt,
        [EXTENSION_LAST_SHOWN_AT_STORAGE_KEY]: 0,
      },
      resolve,
    );
  });
}

export async function consumeMiniQuizStartRequest(
  storage = readChromeLocalStorage(),
): Promise<boolean> {
  if (!storage) {
    return false;
  }

  return new Promise((resolve) => {
    storage.get(EXTENSION_FORCE_START_STORAGE_KEY, (items) => {
      const requestedAt = items[EXTENSION_FORCE_START_STORAGE_KEY];
      const hasRequest =
        typeof requestedAt === "number" &&
        Number.isFinite(requestedAt) &&
        requestedAt > 0;

      storage.set(
        {
          [EXTENSION_FORCE_START_STORAGE_KEY]: 0,
        },
        () => resolve(hasRequest),
      );
    });
  });
}

export function normalizeExtensionSettings(value: unknown): ExtensionSettings {
  if (!isRecord(value)) {
    return DEFAULT_EXTENSION_SETTINGS;
  }

  return {
    intervalHours: normalizeOption(
      value.intervalHours,
      INTERVAL_HOUR_OPTIONS,
      DEFAULT_EXTENSION_SETTINGS.intervalHours,
    ),
    questionsPerRound: normalizeOption(
      value.questionsPerRound,
      QUESTIONS_PER_ROUND_OPTIONS,
      DEFAULT_EXTENSION_SETTINGS.questionsPerRound,
    ),
  };
}

export function getDelayUntilNextQuiz(
  settings: ExtensionSettings,
  lastShownAt: number | null,
  now = Date.now(),
): number {
  const intervalMs = settings.intervalHours * 60 * 60 * 1000;

  if (lastShownAt === null) {
    return intervalMs;
  }

  if (lastShownAt <= 0) {
    return 0;
  }

  const nextShownAt = lastShownAt + intervalMs;

  return Math.max(0, nextShownAt - now);
}

function normalizeOption(
  value: unknown,
  options: readonly number[],
  fallback: number,
): number {
  const numericValue =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);

  return options.includes(numericValue) ? numericValue : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
