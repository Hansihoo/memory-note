import { describe, expect, it } from "vitest";
import { parseWordMarkdown, serializeWordsToMarkdown } from "./markdown";

describe("markdown helpers", () => {
  it("parses key, value, and lastViewedAt table columns", () => {
    const rows = parseWordMarkdown(`
| key | value | lastViewedAt |
| --- | --- | --- |
| retain | 유지하다 | 2026-05-01T12:00:00.000Z |
| context | 맥락 | - |
`);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      key: "retain",
      value: "유지하다",
      lastViewedAt: "2026-05-01T12:00:00.000Z"
    });
    expect(rows[1].lastViewedAt).toBeNull();
  });

  it("serializes words into an importable markdown table", () => {
    const markdown = serializeWordsToMarkdown([
      { key: "a|b", value: "line\nbreak", lastViewedAt: null }
    ]);

    expect(markdown).toContain("| key | value | lastViewedAt |");
    expect(markdown).toContain("| a\\|b | line break | - |");
  });
});
