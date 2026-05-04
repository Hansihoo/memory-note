import { expect, test } from "@playwright/test";

test("creates a wordbook, imports markdown, and studies one card", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Google로 시작하기" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "다시 학습하기" })).toBeVisible();
  await page.getByRole("button", { name: "가입", exact: true }).click();
  const username = `demo-${Date.now()}`;
  await page.getByLabel("아이디").fill(username);
  await page.getByLabel("비밀번호").fill("password123");
  await page.getByRole("button", { name: "가입하기" }).click();
  await expect(page.getByRole("navigation", { name: "상단 메뉴" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "단어장 목록" }).getByRole("button", { name: /암기 노트 기본 단어/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "단어장 목록" }).getByRole("button", { name: /암기 노트 기본 문장/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "단어장 목록" }).getByRole("button", { name: /100/ })).toHaveCount(2);
  await page.getByRole("navigation", { name: "단어장 목록" }).getByRole("button", { name: /암기 노트 기본 문장/ }).click();
  await expect(page.locator(".notebook-question .study-term")).toHaveClass(/compact-study-text/);

  const wordbookName = `시험 단어장 ${Date.now()}`;
  await page.getByLabel("새 단어장 이름").fill(wordbookName);
  await page.getByRole("button", { name: "단어장 만들기" }).click();
  await expect(page.getByRole("navigation", { name: "단어장 목록" }).getByRole("button", { name: new RegExp(wordbookName) })).toBeVisible();
  await expect(page.getByRole("region", { name: "단어장 편집" })).toBeVisible();

  await page.getByLabel("질문 1").fill("apple");
  await page.getByLabel("답변 1").fill("사과");
  await page.getByRole("button", { name: "줄 추가" }).click();
  await page.getByLabel("질문 2").focus();
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('[aria-label="질문 2"]');
    if (!input) {
      throw new Error("paste target not found");
    }
    const data = new DataTransfer();
    data.setData("text/plain", "book\t책\nstudy\t공부하다");
    input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await page.getByRole("button", { name: "단어 저장" }).click();
  await expect(page.getByText("3개 단어를 저장했습니다.")).toBeVisible();
  const wordSheet = page.getByRole("table", { name: "단어 추가 및 삭제표" });
  await expect(wordSheet).toBeVisible();
  const appleCell = wordSheet.locator(".saved-sheet-row", { hasText: "apple" }).locator(".selectable-cell").first();
  await appleCell.click();
  await expect(appleCell).toHaveClass(/selected-cell/);
  await wordSheet.locator(".saved-sheet-row", { hasText: "apple" }).locator(".muted-cell").click();
  await expect(appleCell).not.toHaveClass(/selected-cell/);
  await expect(wordSheet.getByRole("button", { name: "study 삭제" })).toBeVisible();
  await wordSheet.getByRole("button", { name: "study 삭제" }).click();
  await expect(wordSheet.getByRole("button", { name: "study 삭제" })).toHaveCount(0);

  await expect(page.getByRole("table", { name: "단어 추가 및 삭제표" })).toBeVisible();
  await page.getByRole("button", { name: "파일 내보내기" }).click();
  await expect(page.getByRole("table", { name: "단어 추가 및 삭제표" })).toHaveCount(0);
  const exportEditor = page.getByLabel("내보내기 Markdown");
  await expect(exportEditor).toBeVisible();
  await expect(exportEditor).toHaveValue(/apple/);
  await expect(exportEditor).toHaveValue(/book/);
  await expect(page.getByRole("button", { name: "Markdown 다운로드" })).toBeVisible();

  await page.getByRole("button", { name: "파일 가져오기" }).click();
  await expect(page.getByRole("dialog", { name: "파일 가져오기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Google Drive" })).toBeVisible();
  await page.getByRole("button", { name: "Google Drive" }).click();
  await expect(page.getByRole("button", { name: "Google Drive에서 선택" })).toBeEnabled();
  await expect(page.getByText("Google Cloud 설정 후 사용할 수 있습니다.")).toBeVisible();
  await page.getByRole("button", { name: "Google Drive에서 선택" }).click();
  await expect(page.getByText("Google Drive를 열려면 Google Cloud OAuth/API 설정이 필요합니다.")).toBeVisible();
  await page.getByRole("button", { name: "로컬 파일" }).click();
  await page.getByLabel("로컬 Markdown 파일").setInputFiles("tests/fixtures/imported-travel.md");
  const markdownEditor = page.getByLabel("가져오기 Markdown");
  await expect(markdownEditor).toBeVisible();
  await expect(markdownEditor).toHaveValue(/listen/);
  await expect(page.getByLabel("새 암기장 이름")).toHaveValue("imported-travel");
  await expect(page.getByText("3개 단어를 새 암기장으로 만들 수 있습니다.")).toBeVisible();
  await page.getByRole("button", { name: "새 암기장 만들기" }).click();
  await expect(page.getByText("3개 단어로 새 암기장을 만들었습니다.")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "단어장 목록" }).getByRole("button", { name: /imported-travel/ })).toBeVisible();

  await page.getByRole("button", { name: "암기", exact: true }).click();
  await expect(page.getByText("질문 카드")).toHaveCount(0);
  await expect(page.getByText("질문", { exact: true })).toHaveCount(0);
  await expect(page.getByText("답변", { exact: true })).toHaveCount(0);
  await expect(page.getByText("단어 보고 뜻 맞히기")).toHaveCount(0);
  await expect(page.getByText("뜻 보고 단어 맞히기")).toHaveCount(0);
  const question = page.locator(".notebook-question .study-term");
  const answer = page.locator(".notebook-answer .study-answer");
  await expect(question).not.toHaveText("");
  await expect(answer).toHaveCount(0);
  const firstQuestion = await question.innerText();
  await page.getByRole("button", { name: "모르겠음" }).click();
  await expect(answer).not.toHaveText("");
  await expect(page.getByRole("button", { name: "다음" })).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await expect.poll(async () => question.innerText(), { timeout: 2000 }).not.toBe(firstQuestion);
  await expect(answer).toHaveCount(0);

  const secondQuestion = await question.innerText();
  await page.getByRole("button", { name: "알고 있음" }).click();
  await expect(answer).not.toHaveText("");
  await expect(page.getByRole("button", { name: "다음" })).toBeVisible();
  await page.waitForTimeout(700);
  await expect(question).toHaveText(secondQuestion);
  await page.getByRole("button", { name: "다음" }).click();
  await expect.poll(async () => question.innerText(), { timeout: 2000 }).not.toBe(secondQuestion);
  await expect(answer).toHaveCount(0);
});
