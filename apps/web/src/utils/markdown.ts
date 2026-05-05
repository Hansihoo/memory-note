import type { Word } from "../types";
import { debugLog } from "./logger";

export interface ParsedWord {
  key: string;
  value: string;
  itemType?: Word["itemType"];
  lastViewedAt: string | null;
  exampleSentence: string | null;
  tags: string[] | null;
  cloze: string | null;
}

function normalizeDate(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") {
    return null;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeOptionalText(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed && trimmed !== "-" ? trimmed : null;
}

function normalizeTags(value: string | undefined): string[] | null {
  if (!value || value.trim() === "-") {
    return null;
  }
  const tags = (value ?? "")
    .split(/[,;]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  return tags.length > 0 ? tags : null;
}

function normalizeItemType(value: string | undefined): Word["itemType"] | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized && ["WORD", "QA", "COMMAND", "SENTENCE"].includes(normalized)
    ? (normalized as Word["itemType"])
    : undefined;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isDivider(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

export function parseWordMarkdown(markdown: string): ParsedWord[] {
  const rows = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"))
    .map(splitRow)
    .filter((cells) => !isDivider(cells));

  if (rows.length === 0) {
    debugLog("import", "No markdown table rows found");
    return [];
  }

  const header = rows[0].map((cell) => cell.toLowerCase());
  const keyIndex = header.findIndex((cell) => ["key", "word", "front", "question", "prompt", "질문", "단어"].includes(cell));
  const valueIndex = header.findIndex((cell) => ["value", "meaning", "back", "answer", "뜻", "답변"].includes(cell));
  const viewedIndex = header.findIndex((cell) => ["lastviewedat", "last viewed at", "last_viewed_at", "최근학습"].includes(cell));
  const exampleIndex = header.findIndex((cell) => ["examplesentence", "example sentence", "example_sentence", "example", "sentence", "예문"].includes(cell));
  const itemTypeIndex = header.findIndex((cell) => ["itemtype", "item type", "item_type", "type", "유형"].includes(cell));
  const tagsIndex = header.findIndex((cell) => ["tags", "tag", "태그"].includes(cell));
  const clozeIndex = header.findIndex((cell) => ["cloze", "clozetext", "cloze text", "cloze_text", "빈칸"].includes(cell));

  if (keyIndex < 0 || valueIndex < 0) {
    throw new Error("Markdown table must include key and value columns.");
  }

  const parsed = rows
    .slice(1)
    .map((cells) => ({
      key: cells[keyIndex]?.trim() ?? "",
      value: cells[valueIndex]?.trim() ?? "",
      lastViewedAt: normalizeDate(cells[viewedIndex]),
      exampleSentence: normalizeOptionalText(cells[exampleIndex]),
      itemType: normalizeItemType(cells[itemTypeIndex]),
      tags: normalizeTags(cells[tagsIndex]),
      cloze: normalizeOptionalText(cells[clozeIndex])
    }))
    .filter((word) => word.key.length > 0 && word.value.length > 0);

  debugLog("import", "Parsed markdown rows", { count: parsed.length });
  return parsed;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function serializeWordsToMarkdown(words: Array<Pick<Word, "key" | "value" | "itemType" | "lastViewedAt" | "exampleSentence" | "tags" | "cloze">>): string {
  const lines = ["| key | value | itemType | exampleSentence | tags | cloze | lastViewedAt |", "| --- | --- | --- | --- | --- | --- | --- |"];

  for (const word of words) {
    lines.push(
      `| ${escapeCell(word.key)} | ${escapeCell(word.value)} | ${word.itemType ?? "WORD"} | ${escapeCell(word.exampleSentence ?? "") || "-"} | ${escapeCell((word.tags ?? []).join(", ")) || "-"} | ${escapeCell(word.cloze ?? "") || "-"} | ${word.lastViewedAt ?? "-"} |`
    );
  }

  debugLog("import", "Serialized words to markdown", { count: words.length });
  return `${lines.join("\n")}\n`;
}
