export interface ExtensionStorageArea {
  get(
    key: string | string[],
    callback: (items: Record<string, unknown>) => void,
  ): void;
  set(items: Record<string, unknown>, callback?: () => void): void;
}

interface MemoryNoteChromeApi {
  storage?: {
    local?: ExtensionStorageArea;
  };
}

export function readChromeLocalStorage(): ExtensionStorageArea | undefined {
  const chromeApi = (
    globalThis as typeof globalThis & {
      chrome?: MemoryNoteChromeApi;
    }
  ).chrome;

  return chromeApi?.storage?.local;
}
