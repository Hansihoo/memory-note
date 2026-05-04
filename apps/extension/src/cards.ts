import {
  DEFAULT_MINI_QUIZ_CARDS,
  sanitizeMemoryCards,
  type MemoryCard,
} from "@memory-note/core";

import { readChromeLocalStorage, type ExtensionStorageArea } from "./storage";

export const EXTENSION_CARDS_STORAGE_KEY = "memoryNote.extension.cards.v1";

interface StoredPromptAnswerCard {
  id?: unknown;
  prompt?: unknown;
  answer?: unknown;
  source?: unknown;
}

interface StoredKeyValueCard {
  id?: unknown;
  key?: unknown;
  value?: unknown;
  wordbookId?: unknown;
}

export async function loadExtensionCards(
  storage = readChromeLocalStorage(),
): Promise<MemoryCard[]> {
  if (!storage) {
    return DEFAULT_MINI_QUIZ_CARDS;
  }

  return new Promise((resolve) => {
    storage.get(EXTENSION_CARDS_STORAGE_KEY, (items) => {
      resolve(normalizeStoredCards(items[EXTENSION_CARDS_STORAGE_KEY]));
    });
  });
}

export function normalizeStoredCards(value: unknown): MemoryCard[] {
  if (!Array.isArray(value)) {
    return DEFAULT_MINI_QUIZ_CARDS;
  }

  const cards = sanitizeMemoryCards(value.map(toMemoryCard));

  return cards.length > 0 ? cards : DEFAULT_MINI_QUIZ_CARDS;
}

function toMemoryCard(value: unknown, index: number): MemoryCard {
  if (isRecord(value) && hasPromptAnswer(value)) {
    return {
      id: readString(value.id) || `stored-card-${index + 1}`,
      prompt: readString(value.prompt),
      answer: readString(value.answer),
      source: readString(value.source) || "extension-storage",
    };
  }

  if (isRecord(value) && hasKeyValue(value)) {
    return {
      id: readString(value.id) || `stored-card-${index + 1}`,
      prompt: readString(value.key),
      answer: readString(value.value),
      source: readString(value.wordbookId) || "extension-storage",
    };
  }

  return {
    id: `stored-card-${index + 1}`,
    prompt: "",
    answer: "",
    source: "extension-storage",
  };
}

function hasPromptAnswer(
  value: Record<string, unknown>,
): value is Record<string, unknown> & StoredPromptAnswerCard {
  return "prompt" in value || "answer" in value;
}

function hasKeyValue(
  value: Record<string, unknown>,
): value is Record<string, unknown> & StoredKeyValueCard {
  return "key" in value || "value" in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export type { ExtensionStorageArea };
