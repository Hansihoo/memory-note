interface MemoryNoteTab {
  id?: number;
  url?: string;
}

interface MemoryNoteChromeApi {
  runtime?: {
    onInstalled?: {
      addListener(callback: () => void): void;
    };
  };
  scripting?: {
    executeScript(options: {
      target: { tabId: number };
      files: string[];
    }): Promise<unknown>;
  };
  tabs?: {
    query(
      queryInfo: Record<string, unknown>,
      callback: (tabs: MemoryNoteTab[]) => void,
    ): void;
  };
}

const HTTP_PAGE_PATTERN = /^https?:\/\//i;

const chromeApi = (
  globalThis as typeof globalThis & {
    chrome?: MemoryNoteChromeApi;
  }
).chrome;

chromeApi?.runtime?.onInstalled?.addListener(() => {
  void injectMiniQuizIntoOpenTabs();
});

void injectMiniQuizIntoOpenTabs();

async function injectMiniQuizIntoOpenTabs(): Promise<void> {
  const tabs = await queryTabs();

  await Promise.all(
    tabs
      .filter((tab): tab is Required<Pick<MemoryNoteTab, "id" | "url">> => {
        return (
          typeof tab.id === "number" && HTTP_PAGE_PATTERN.test(tab.url ?? "")
        );
      })
      .map(async (tab) => {
        try {
          await chromeApi?.scripting?.executeScript({
            target: { tabId: tab.id },
            files: ["content-script.js"],
          });
        } catch {
          // Some tabs block extension injection; they will work after normal reload if allowed.
        }
      }),
  );
}

function queryTabs(): Promise<MemoryNoteTab[]> {
  return new Promise((resolve) => {
    chromeApi?.tabs?.query?.({}, resolve);
  });
}
