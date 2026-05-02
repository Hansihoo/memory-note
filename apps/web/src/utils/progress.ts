import type { ProgressEvent, Wordbook } from "../types";
import { debugLog } from "./logger";

function dayKey(value: string): string {
  return value.slice(0, 10);
}

export function getCumulativeStudyDays(events: ProgressEvent[]): number {
  const count = new Set(events.map((event) => dayKey(event.studiedAt))).size;
  debugLog("progress", "Calculated cumulative study days", { count });
  return count;
}

export function getTodayStudiedCount(events: ProgressEvent[], now = new Date()): number {
  const today = now.toISOString().slice(0, 10);
  const count = events.filter((event) => dayKey(event.studiedAt) === today).length;
  debugLog("progress", "Calculated today studied count", { count });
  return count;
}

export function getRecentWordbooks(wordbooks: Wordbook[], limit = 4): Wordbook[] {
  return [...wordbooks]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

export function recordProgress(
  events: ProgressEvent[],
  payload: Omit<ProgressEvent, "studiedAt">,
  studiedAt = new Date().toISOString()
): ProgressEvent[] {
  const next = [...events, { ...payload, studiedAt }];
  debugLog("progress", "Recorded progress event", { wordbookId: payload.wordbookId, known: payload.known });
  return next;
}
