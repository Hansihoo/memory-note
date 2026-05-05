const DEFAULT_API_BASE_URL = "http://localhost:8000";

export function normalizeApiBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim();
  return (trimmed && trimmed.length > 0 ? trimmed : DEFAULT_API_BASE_URL).replace(/\/$/, "");
}

export const API_BASE_URL = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
