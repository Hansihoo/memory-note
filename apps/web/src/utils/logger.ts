type DebugFlag = "import" | "session" | "progress";

const flagMap: Record<DebugFlag, string> = {
  import: "VITE_DEBUG_IMPORT",
  session: "VITE_DEBUG_SESSION",
  progress: "VITE_DEBUG_PROGRESS"
};

function enabled(flag: DebugFlag): boolean {
  const key = flagMap[flag];
  return String(import.meta.env[key] ?? "").toLowerCase() === "true";
}

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(scrub);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        if (["key", "value", "words", "markdown"].includes(key)) {
          return [key, "[redacted]"];
        }
        return [key, scrub(item)];
      })
    );
  }

  return value;
}

export function debugLog(flag: DebugFlag, message: string, meta?: unknown): void {
  if (!enabled(flag)) {
    return;
  }

  if (meta === undefined) {
    console.debug(`[${flag}] ${message}`);
    return;
  }

  console.debug(`[${flag}] ${message}`, scrub(meta));
}
