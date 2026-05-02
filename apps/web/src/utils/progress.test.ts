import { describe, expect, it } from "vitest";
import { getCumulativeStudyDays, getRecentWordbooks, getTodayStudiedCount, recordProgress } from "./progress";
import type { ProgressEvent, Wordbook } from "../types";

const events: ProgressEvent[] = [
  { wordId: "1", wordbookId: "a", studiedAt: "2026-05-01T01:00:00.000Z", known: true },
  { wordId: "2", wordbookId: "a", studiedAt: "2026-05-01T02:00:00.000Z", known: false },
  { wordId: "3", wordbookId: "b", studiedAt: "2026-05-02T03:00:00.000Z", known: true }
];

describe("progress helpers", () => {
  it("counts unique cumulative study days", () => {
    expect(getCumulativeStudyDays(events)).toBe(2);
  });

  it("counts today's studied events", () => {
    expect(getTodayStudiedCount(events, new Date("2026-05-02T09:00:00.000Z"))).toBe(1);
  });

  it("records a progress event with the supplied timestamp", () => {
    const next = recordProgress([], { wordId: "1", wordbookId: "a", known: true }, "2026-05-02T00:00:00.000Z");

    expect(next).toEqual([{ wordId: "1", wordbookId: "a", known: true, studiedAt: "2026-05-02T00:00:00.000Z" }]);
  });

  it("sorts recent wordbooks by updatedAt", () => {
    const wordbooks = [
      { id: "a", name: "A", words: [], createdAt: "2026", updatedAt: "2026-05-01T00:00:00.000Z" },
      { id: "b", name: "B", words: [], createdAt: "2026", updatedAt: "2026-05-02T00:00:00.000Z" }
    ] satisfies Wordbook[];

    expect(getRecentWordbooks(wordbooks, 1)[0].id).toBe("b");
  });
});
