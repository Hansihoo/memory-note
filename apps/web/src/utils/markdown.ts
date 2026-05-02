import type { Word } from "../types";
import { debugLog } from "./logger";

export interface ParsedWord {
  key: string;
  value: string;
  lastViewedAt: string | null;
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

  if (keyIndex < 0 || valueIndex < 0) {
    throw new Error("Markdown table must include key and value columns.");
  }

  const parsed = rows
    .slice(1)
    .map((cells) => ({
      key: cells[keyIndex]?.trim() ?? "",
      value: cells[valueIndex]?.trim() ?? "",
      lastViewedAt: normalizeDate(cells[viewedIndex])
    }))
    .filter((word) => word.key.length > 0 && word.value.length > 0);

  debugLog("import", "Parsed markdown rows", { count: parsed.length });
  return parsed;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function serializeWordsToMarkdown(words: Array<Pick<Word, "key" | "value" | "lastViewedAt">>): string {
  const lines = ["| key | value | lastViewedAt |", "| --- | --- | --- |"];

  for (const word of words) {
    lines.push(`| ${escapeCell(word.key)} | ${escapeCell(word.value)} | ${word.lastViewedAt ?? "-"} |`);
  }

  debugLog("import", "Serialized words to markdown", { count: words.length });
  return `${lines.join("\n")}\n`;
}
