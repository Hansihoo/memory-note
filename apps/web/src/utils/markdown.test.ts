import { describe, expect, it } from "vitest";
import { parseWordMarkdown, serializeWordsToMarkdown } from "./markdown";

describe("markdown helpers", () => {
  it("parses v2 metadata while keeping date handling", () => {
    const rows = parseWordMarkdown(`
| key | value | itemType | exampleSentence | tags | cloze | lastViewedAt |
| --- | --- | --- | --- | --- | --- | --- |
| retain | 유지하다 | WORD | I retain important details. | memory; verb | I {{c1::retain}} details. | 2026-05-01T12:00:00.000Z |
| context | 맥락 | QA | - | - | - | - |
`);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      key: "retain",
      value: "유지하다",
      itemType: "WORD",
      exampleSentence: "I retain important details.",
      tags: ["memory", "verb"],
      cloze: "I {{c1::retain}} details.",
      lastViewedAt: "2026-05-01T12:00:00.000Z"
    });
    expect(rows[1].itemType).toBe("QA");
    expect(rows[1].exampleSentence).toBeNull();
    expect(rows[1].tags).toBeNull();
    expect(rows[1].cloze).toBeNull();
    expect(rows[1].lastViewedAt).toBeNull();
  });

  it("serializes words into an importable markdown table", () => {
    const markdown = serializeWordsToMarkdown([
      { key: "a|b", value: "line\nbreak", itemType: "WORD", exampleSentence: "a|b appears", tags: ["x", "y"], cloze: "a {{c1::b}}", lastViewedAt: null }
    ]);

    expect(markdown).toContain("| key | value | itemType | exampleSentence | tags | cloze | lastViewedAt |");
    expect(markdown).toContain("| a\\|b | line break | WORD | a\\|b appears | x, y | a {{c1::b}} | - |");
  });
});
