import { describe, expect, it } from "vitest";
import type { Word } from "../types";
import { createStudySession, getCurrentCard, markCurrentViewed, nextCard, revealCurrent } from "./session";

const word = (id: string, key: string, value: string, lastViewedAt: string | null): Word => ({
  id,
  key,
  value,
  lastViewedAt,
  createdAt: `2026-05-0${id}T00:00:00.000Z`,
  updatedAt: `2026-05-0${id}T00:00:00.000Z`,
  deletedAt: null,
  syncRevision: Number(id)
});

describe("session helpers", () => {
  it("starts with never-viewed words before older viewed words", () => {
    const session = createStudySession(
      [word("1", "later", "나중", "2026-05-02T00:00:00.000Z"), word("2", "new", "새", null)],
      () => 0.1
    );

    expect(getCurrentCard(session)?.prompt).toBe("new");
  });

  it("randomizes prompt and answer direction for each card", () => {
    const session = createStudySession([word("1", "recall", "떠올리다", null)], () => 0.8);

    expect(getCurrentCard(session)).toMatchObject({ prompt: "떠올리다", answer: "recall", direction: "value-to-key" });
  });

  it("reveals and advances without mutating the original session", () => {
    const session = createStudySession([word("1", "a", "b", null)], () => 0.1);
    const revealed = revealCurrent(session);
    const advanced = nextCard(revealed);

    expect(session.revealed).toBe(false);
    expect(revealed.revealed).toBe(true);
    expect(advanced.index).toBe(1);
    expect(advanced.revealed).toBe(false);
  });

  it("updates lastViewedAt for the selected word", () => {
    const words = [word("1", "a", "b", null), word("2", "c", "d", null)];
    const updated = markCurrentViewed(words, "2", "2026-05-02T12:00:00.000Z");

    expect(updated[0].lastViewedAt).toBeNull();
    expect(updated[1].lastViewedAt).toBe("2026-05-02T12:00:00.000Z");
  });
});
