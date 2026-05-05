import { readChromeLocalStorage, type ExtensionStorageArea } from "./storage";

export const EXTENSION_AUTH_STORAGE_KEY = "memoryNote.extension.auth.v1";
export const DEFAULT_API_BASE_URL = "http://localhost:8000";
export const DEFAULT_WEB_APP_URL = "https://memory-note-web.vercel.app";

const envWebAppUrl = import.meta.env.VITE_WEB_APP_URL as string | undefined;

export const WEB_APP_URL = normalizeWebAppUrl(
  envWebAppUrl || DEFAULT_WEB_APP_URL,
);

export type WebAuthMode = "login" | "register";

export interface ExtensionAuth {
  token: string;
  apiBaseUrl: string;
  updatedAt: number;
}

export async function loadExtensionAuth(
  storage = readChromeLocalStorage(),
): Promise<ExtensionAuth | null> {
  if (!storage) {
    return null;
  }

  return new Promise((resolve) => {
    storage.get(EXTENSION_AUTH_STORAGE_KEY, (items) => {
      resolve(normalizeExtensionAuth(items[EXTENSION_AUTH_STORAGE_KEY]));
    });
  });
}

export async function saveExtensionAuth(
  auth: Pick<ExtensionAuth, "token"> & Partial<Pick<ExtensionAuth, "apiBaseUrl" | "updatedAt">>,
  storage = readChromeLocalStorage(),
): Promise<ExtensionAuth | null> {
  const normalized = normalizeExtensionAuth({
    token: auth.token,
    apiBaseUrl: auth.apiBaseUrl ?? DEFAULT_API_BASE_URL,
    updatedAt: auth.updatedAt ?? Date.now(),
  });
  if (!normalized || !storage) {
    return normalized;
  }

  return new Promise((resolve) => {
    storage.set({ [EXTENSION_AUTH_STORAGE_KEY]: normalized }, () => {
      resolve(normalized);
    });
  });
}

export function normalizeExtensionAuth(value: unknown): ExtensionAuth | null {
  if (!isRecord(value)) {
    return null;
  }

  const token = readString(value.token);
  if (!token) {
    return null;
  }

  return {
    token,
    apiBaseUrl: normalizeApiBaseUrl(readString(value.apiBaseUrl) || DEFAULT_API_BASE_URL),
    updatedAt: typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) ? value.updatedAt : Date.now(),
  };
}

export function normalizeApiBaseUrl(value: string): string {
  return (value.trim() || DEFAULT_API_BASE_URL).replace(/\/$/, "");
}

export function createWebAuthUrl(
  mode: WebAuthMode = "login",
  baseUrl = WEB_APP_URL,
): string {
  const url = new URL(normalizeWebAppUrl(baseUrl));
  url.searchParams.set("auth", mode);
  url.searchParams.set("source", "extension");
  return url.toString();
}

export function normalizeWebAppUrl(value: string): string {
  const trimmed = (value.trim() || DEFAULT_WEB_APP_URL).replace(/\/$/, "");

  try {
    return new URL(trimmed).toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_WEB_APP_URL;
  }
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
