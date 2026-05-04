import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "..");
const distDir = resolve(appDir, "dist");
const userDataDir = await mkdtemp(join(tmpdir(), "memory-note-extension-"));
const storageKeys = {
  auth: "memoryNote.extension.auth.v1",
  settings: "memoryNote.extension.settings.v1",
  lastShownAt: "memoryNote.extension.lastShownAt.v1"
};

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"]
]);

const server = await startStaticServer();
let context;

try {
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: process.env.EXTENSION_SMOKE_HEADLESS === "1",
    args: [
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`
    ]
  });

  const extensionId = await resolveExtensionId(context);

  await verifyPopup(context, extensionId);
  await verifyTimedContentQuiz(context, extensionId, server.url);

  console.log("Extension smoke check passed.");
} finally {
  await context?.close();
  await server.close();
  await rm(userDataDir, { recursive: true, force: true });
}

async function verifyPopup(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await seedStorage(page, server.url);

  await expect(page.getByRole("button", { name: "암기 시작" })).toBeVisible();
  await expect(page.locator(".home-note")).toBeVisible();
  await page.getByRole("button", { name: "암기 시작" }).click();

  await expect(page.getByText("1/5")).toBeVisible();
  await expect(page.getByText("답을 선택하면 표시됩니다")).toBeVisible();
  await expect(page.getByText("문제")).toHaveCount(0);
  await expect(page.getByText("암기 노트")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "문제 듣기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "답 듣기" })).toHaveCount(0);

  const knowButton = page.getByRole("button", { name: "알고 있음" });
  await expect(knowButton).toHaveText("O");

  const knowButtonBox = await knowButton.boundingBox();
  if (!knowButtonBox || knowButtonBox.height > 38 || knowButtonBox.width > 48) {
    throw new Error("Popup O/X buttons are larger than the compact target.");
  }

  await knowButton.click();
  await expect(page.getByText("여권")).toBeVisible();
  await expect(page.getByRole("button", { name: "답 듣기" })).toBeVisible();

  const nextButton = page.getByRole("button", { name: "다음 단어" });
  const nextButtonBox = await nextButton.boundingBox();
  if (
    !nextButtonBox ||
    Math.abs(nextButtonBox.x - knowButtonBox.x) > 2 ||
    Math.abs(nextButtonBox.y - knowButtonBox.y) > 2
  ) {
    throw new Error("Popup next button does not replace the selected O/X position.");
  }

  await page.close();
}

async function verifyTimedContentQuiz(context, extensionId, baseUrl) {
  const controlPage = await context.newPage();
  const page = await context.newPage();
  const testPageUrl = `${baseUrl}/test-page.html`;

  await controlPage.goto(`chrome-extension://${extensionId}/popup.html`);
  await seedStorage(controlPage, baseUrl);
  await page.goto(testPageUrl);
  await page.evaluate(() => {
    const legacyRoot = document.createElement("div");
    legacyRoot.id = "memory-note-mini-quiz-root";
    legacyRoot.textContent = "legacy quiz shell";
    document.documentElement.append(legacyRoot);
  });
  await injectContentScript(controlPage, `${baseUrl}/*`);

  await expect
    .poll(() => readMiniQuizShadowText(page), { timeout: 8_000 })
    .toContain("답을 선택하면 표시됩니다");

  const quizText = await readMiniQuizShadowText(page);
  if (quizText.includes("문제") || quizText.includes("암기 노트")) {
    throw new Error("Content quiz still contains removed heading text.");
  }

  const choiceMetrics = await page.evaluate(() => {
    const root = document.getElementById("memory-note-mini-quiz-root");
    const button = root?.shadowRoot?.querySelector('[data-action="know"]');
    const rect = button?.getBoundingClientRect();
    const promptSpeakButton = root?.shadowRoot?.querySelector(
      '[aria-label="문제 듣기"]'
    );
    const answerSpeakButton = root?.shadowRoot?.querySelector(
      '[aria-label="답 듣기"]'
    );

    if (!rect) {
      return null;
    }

    return {
      hasAnswerSpeakButton: Boolean(answerSpeakButton),
      hasPromptSpeakButton: Boolean(promptSpeakButton),
      height: rect.height,
      text: button.textContent?.trim(),
      width: rect.width,
      x: rect.x,
      y: rect.y
    };
  });

  if (
    !choiceMetrics ||
    !choiceMetrics.hasPromptSpeakButton ||
    choiceMetrics.hasAnswerSpeakButton ||
    choiceMetrics.text !== "O" ||
    choiceMetrics.height > 38 ||
    choiceMetrics.width > 48
  ) {
    throw new Error("Content quiz controls are not in the expected compact state.");
  }

  await page.evaluate(() => {
    const root = document.getElementById("memory-note-mini-quiz-root");
    const knowButton = root?.shadowRoot?.querySelector('[data-action="know"]');
    knowButton?.click();
  });

  const nextMetrics = await page.evaluate(() => {
    const root = document.getElementById("memory-note-mini-quiz-root");
    const nextButton = root?.shadowRoot?.querySelector('[data-action="next"]');
    const answerSpeakButton = root?.shadowRoot?.querySelector(
      '[aria-label="답 듣기"]'
    );
    const rect = nextButton?.getBoundingClientRect();

    if (!rect) {
      return null;
    }

    return {
      hasAnswerSpeakButton: Boolean(answerSpeakButton),
      text: nextButton.textContent?.trim(),
      x: rect.x,
      y: rect.y
    };
  });

  if (
    !nextMetrics ||
    !nextMetrics.hasAnswerSpeakButton ||
    nextMetrics.text !== "다음" ||
    Math.abs(nextMetrics.x - choiceMetrics.x) > 2 ||
    Math.abs(nextMetrics.y - choiceMetrics.y) > 2
  ) {
    throw new Error("Content next button does not replace the selected O/X position.");
  }

  await page.close();
  await controlPage.close();
}

async function seedStorage(page, apiBaseUrl) {
  await page.evaluate(
    ({ auth, settings, lastShownAt, apiBaseUrl }) =>
      new Promise((resolvePromise) => {
        chrome.storage.local.set(
          {
            [auth]: {
              token: "smoke-token",
              apiBaseUrl,
              updatedAt: Date.now()
            },
            [settings]: {
              intervalHours: 1,
              questionsPerRound: 5
            },
            [lastShownAt]: 0
          },
          resolvePromise
        );
      }),
    { ...storageKeys, apiBaseUrl }
  );
}

async function injectContentScript(page, tabUrlPattern) {
  await page.evaluate(
    ({ urlPattern }) =>
      new Promise((resolvePromise, rejectPromise) => {
        chrome.tabs.query({ url: urlPattern }, (tabs) => {
          const tabId = tabs[0]?.id;

          if (typeof tabId !== "number") {
            rejectPromise(new Error(`Could not find tab for ${urlPattern}`));
            return;
          }

          chrome.scripting.executeScript(
            {
              target: { tabId },
              files: ["content-script.js"]
            },
            () => resolvePromise(undefined)
          );
        });
      }),
    { urlPattern: tabUrlPattern }
  );
}

async function readMiniQuizShadowText(page) {
  return page.evaluate(() => {
    const root = document.getElementById("memory-note-mini-quiz-root");

    return root?.shadowRoot?.textContent ?? "";
  });
}

async function resolveExtensionId(context) {
  const existingWorker = context.serviceWorkers()[0];
  const serviceWorker =
    existingWorker ?? (await context.waitForEvent("serviceworker", { timeout: 10_000 }));

  return new URL(serviceWorker.url()).host;
}

async function startStaticServer() {
  const serverInstance = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

      if (requestUrl.pathname === "/test-page.html") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(`
          <!doctype html>
          <html lang="ko">
            <head><meta charset="utf-8" /><title>Extension Smoke Page</title></head>
            <body><main><h1>Local smoke page</h1></main></body>
          </html>
        `);
        return;
      }

      if (requestUrl.pathname === "/study/today") {
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(
          JSON.stringify({
            summary: {
              dueCount: 0,
              newCount: 1,
              weakCount: 0,
              estimatedMinutes: 1
            },
            cards: [
              {
                cardId: 99,
                memoryItemId: 50,
                legacyWordId: 10,
                wordbookId: 1,
                cardType: "BASIC_KEY_TO_VALUE",
                prompt: "passport",
                answer: "여권",
                status: "NEW",
                dueAt: "2026-05-04T00:00:00Z",
                lapses: 0,
                leechScore: 0
              }
            ]
          })
        );
        return;
      }

      if (requestUrl.pathname === "/study/cards/99/review") {
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(
          JSON.stringify({
            cardId: 99,
            memoryItemId: 50,
            legacyWordId: 10,
            wordbookId: 1,
            rating: "GOOD",
            status: "REVIEW",
            dueAt: "2026-05-05T00:00:00Z",
            lastReviewedAt: "2026-05-04T00:00:00Z",
            intervalDays: 1,
            lapses: 0,
            streak: 1,
            leechScore: 0,
            reviewLogId: 77,
            deduplicated: false
          })
        );
        return;
      }

      const filePath = resolve(distDir, `.${decodeURIComponent(requestUrl.pathname)}`);
      const normalizedDistDir = distDir.endsWith(sep) ? distDir : `${distDir}${sep}`;

      if (!filePath.startsWith(normalizedDistDir)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const content = await readFile(filePath);
      response.writeHead(200, {
        "content-type": mimeTypes.get(extname(filePath)) ?? "application/octet-stream"
      });
      response.end(content);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });

  await new Promise((resolvePromise) => {
    serverInstance.listen(0, "127.0.0.1", resolvePromise);
  });

  const address = serverInstance.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not start extension smoke server.");
  }

  return {
    close: () =>
      new Promise((resolvePromise, rejectPromise) => {
        serverInstance.close((error) => {
          if (error) {
            rejectPromise(error);
            return;
          }

          resolvePromise();
        });
      }),
    url: `http://127.0.0.1:${address.port}`
  };
}
