import { BookOpen, Check, ChevronLeft, ChevronRight, Download, LogOut, Plus, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClipboardEvent, FormEvent } from "react";
import { apiClient } from "./api/client";
import type { ProfileSummary, UserProfile, Word, Wordbook } from "./types";
import { parseWordMarkdown, serializeWordsToMarkdown } from "./utils/markdown";
import { createStudySession, getCurrentCard, nextCard, revealCurrent, type StudySession } from "./utils/session";

const DRAFT_ROW_COUNT = 1;
const BLANK_SHEET_ROW_COUNT = 18;
const DEMO_USERNAME_KEY = "memory-assistant-demo-username";
const DEMO_PASSWORD = "password123";

const sampleWords = [
  { key: "apple", value: "사과" },
  { key: "book", value: "책" },
  { key: "study", value: "공부하다" },
  { key: "remember", value: "기억하다" },
  { key: "listen", value: "듣다" },
  { key: "answer", value: "대답" }
];

const emptyProfile: ProfileSummary = {
  cumulativeLearningDays: 0,
  todayStudiedCount: 0,
  recentWordbooks: []
};

interface DraftRow {
  question: string;
  answer: string;
}

type HomeView = "study" | "edit" | "profile";
type ReviewState = "question" | "known-reveal" | "unknown-reveal";
type SheetColumn = "question" | "answer";

interface SheetSelection {
  rowId: string;
  column: SheetColumn;
}

function createDraftRows(count = DRAFT_ROW_COUNT): DraftRow[] {
  return Array.from({ length: count }, () => ({ question: "", answer: "" }));
}

function getDemoUsername(): string {
  const storedUsername = localStorage.getItem(DEMO_USERNAME_KEY);
  if (storedUsername) {
    return storedUsername;
  }

  const username = `demo-${Date.now()}`;
  localStorage.setItem(DEMO_USERNAME_KEY, username);
  return username;
}

function updateWordbookWords(wordbooks: Wordbook[], wordbookId: string, updater: (words: Word[]) => Word[]): Wordbook[] {
  return wordbooks.map((wordbook) =>
    wordbook.id === wordbookId ? { ...wordbook, words: updater(wordbook.words), updatedAt: new Date().toISOString() } : wordbook
  );
}

export function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [summary, setSummary] = useState<ProfileSummary>(emptyProfile);
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [wordbooks, setWordbooks] = useState<Wordbook[]>([]);
  const [activeWordbookId, setActiveWordbookId] = useState("");
  const [newWordbookName, setNewWordbookName] = useState("");
  const [editingWordbookName, setEditingWordbookName] = useState("");
  const [draftRows, setDraftRows] = useState<DraftRow[]>(() => createDraftRows());
  const [markdown, setMarkdown] = useState("");
  const [message, setMessage] = useState("");
  const [session, setSession] = useState<StudySession | null>(null);
  const [reviewState, setReviewState] = useState<ReviewState>("question");
  const [selectedCell, setSelectedCell] = useState<SheetSelection | null>(null);
  const [homeView, setHomeView] = useState<HomeView>("study");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [appError, setAppError] = useState("");
  const [loading, setLoading] = useState(false);

  const activeWordbook = wordbooks.find((wordbook) => wordbook.id === activeWordbookId) ?? wordbooks[0] ?? null;
  const currentCard = session ? getCurrentCard(session) : null;
  const recentWordbooks = useMemo(
    () =>
      summary.recentWordbooks.length > 0
        ? summary.recentWordbooks
        : wordbooks.slice(0, 4).map((wordbook) => ({
            wordbookId: wordbook.id,
            name: wordbook.name,
            studiedCount: 0,
            knownCount: 0,
            unknownCount: 0,
            lastStudiedAt: null
          })),
    [summary.recentWordbooks, wordbooks]
  );

  async function createSampleWordbook(): Promise<Wordbook> {
    const wordbook = await apiClient.createWordbook("기본 영어 단어장");
    const words = await apiClient.batchWords(wordbook.id, sampleWords);
    return { ...wordbook, words };
  }

  const loadWordbooks = useCallback(async () => {
    let loaded = await apiClient.listWordbooks();
    if (loaded.length === 0) {
      loaded = [await createSampleWordbook()];
    }
    setWordbooks(loaded);
    setActiveWordbookId((current) => current || loaded[0]?.id || "");
    setEditingWordbookName((current) => current || loaded[0]?.name || "");
  }, []);

  const loadSummary = useCallback(async () => {
    setSummary(await apiClient.profileSummary());
  }, []);

  const loadAfterAuth = useCallback(async () => {
    setLoading(true);
    setAppError("");
    try {
      await Promise.all([loadWordbooks(), loadSummary()]);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [loadSummary, loadWordbooks]);

  useEffect(() => {
    if (!apiClient.hasToken()) {
      return;
    }

    void apiClient
      .me()
      .then((user) => {
        setProfile(user);
        return loadAfterAuth();
      })
      .catch(() => {
        setProfile(null);
      });
  }, [loadAfterAuth]);

  function resetStudySession() {
    setSession(null);
    setReviewState("question");
  }

  function selectSheetCell(rowId: string, column: SheetColumn) {
    setSelectedCell({ rowId, column });
  }

  function sheetCellClass(rowId: string, column: SheetColumn, extraClass = "") {
    return ["sheet-cell", "selectable-cell", selectedCell?.rowId === rowId && selectedCell.column === column ? "selected-cell" : "", extraClass]
      .filter(Boolean)
      .join(" ");
  }

  useEffect(() => {
    if (!activeWordbook || activeWordbook.words.length === 0) {
      if (session) {
        resetStudySession();
      }
      return;
    }

    if (!session || !getCurrentCard(session)) {
      setSession(createStudySession(activeWordbook.words));
      setReviewState("question");
    }
  }, [activeWordbook?.id, activeWordbook?.words.length, session]);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    const enteredUsername = loginName.trim();
    const username = enteredUsername.length >= 3 ? enteredUsername : getDemoUsername();
    const loginPassword = password.length >= 8 ? password : DEMO_PASSWORD;

    setAuthError("");
    try {
      const user = await apiClient.loginOrRegister({ username, password: loginPassword });
      setProfile(user);
      await loadAfterAuth();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "로그인에 실패했습니다.");
    }
  }

  async function handleLogout() {
    await apiClient.logout();
    setProfile(null);
    setWordbooks([]);
    setSummary(emptyProfile);
    resetStudySession();
  }

  async function handleCreateWordbook(event: FormEvent) {
    event.preventDefault();
    const name = newWordbookName.trim();
    if (!name) {
      return;
    }

    const created = await apiClient.createWordbook(name);
    setWordbooks((current) => [created, ...current]);
    setActiveWordbookId(created.id);
    setEditingWordbookName(created.name);
    setSelectedCell(null);
    setNewWordbookName("");
    setDraftRows(createDraftRows());
    setHomeView("edit");
    resetStudySession();
  }

  async function handleRenameWordbook(event: FormEvent) {
    event.preventDefault();
    const name = editingWordbookName.trim();
    if (!activeWordbook || !name) {
      return;
    }

    const updated = await apiClient.renameWordbook(activeWordbook.id, name);
    setWordbooks((current) => current.map((wordbook) => (wordbook.id === updated.id ? { ...wordbook, ...updated, words: wordbook.words } : wordbook)));
  }

  async function handleDeleteWordbook(id: string) {
    await apiClient.deleteWordbook(id);
    setWordbooks((current) => {
      const next = current.filter((wordbook) => wordbook.id !== id);
      setActiveWordbookId(next[0]?.id ?? "");
      setEditingWordbookName(next[0]?.name ?? "");
      return next;
    });
    resetStudySession();
    await loadSummary();
  }

  function selectWordbook(wordbook: Wordbook) {
    setActiveWordbookId(wordbook.id);
    setEditingWordbookName(wordbook.name);
    setDraftRows(createDraftRows());
    setSelectedCell(null);
    resetStudySession();
  }

  function updateDraftRow(index: number, field: keyof DraftRow, value: string) {
    setDraftRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
  }

  function clearDraftRow(index: number) {
    setDraftRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { question: "", answer: "" } : row)));
    setSelectedCell(null);
  }

  function addDraftRows(count = 4) {
    setDraftRows((current) => [...current, ...createDraftRows(count)]);
  }

  function handleDraftPaste(event: ClipboardEvent<HTMLInputElement>, startIndex: number, field: keyof DraftRow) {
    const text = event.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) {
      return;
    }

    event.preventDefault();
    const pastedRows = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => line.split("\t").map((cell) => cell.trim()));

    setDraftRows((current) => {
      const next = [...current];
      while (next.length < startIndex + pastedRows.length) {
        next.push({ question: "", answer: "" });
      }

      pastedRows.forEach((cells, offset) => {
        const row = { ...next[startIndex + offset] };
        if (field === "question") {
          row.question = cells[0] ?? row.question;
          row.answer = cells[1] ?? row.answer;
        } else {
          row.answer = cells[0] ?? row.answer;
        }
        next[startIndex + offset] = row;
      });

      return next;
    });
  }

  async function handleSaveDraftRows() {
    if (!activeWordbook) {
      return;
    }

    const entries = draftRows
      .map((row) => ({ key: row.question.trim(), value: row.answer.trim() }))
      .filter((row) => row.key.length > 0 && row.value.length > 0);

    if (entries.length === 0) {
      setMessage("추가할 질문과 답변을 입력하세요.");
      return;
    }

    const saved = await apiClient.batchWords(activeWordbook.id, entries);
    const refreshed = await apiClient.listWords(activeWordbook.id);
    setWordbooks((current) => updateWordbookWords(current, activeWordbook.id, () => refreshed));
    setDraftRows(createDraftRows());
    setSelectedCell(null);
    setMessage(`${saved.length}개 단어를 저장했습니다.`);
    resetStudySession();
  }

  async function handleAddSampleWords() {
    if (!activeWordbook) {
      return;
    }
    await apiClient.batchWords(activeWordbook.id, sampleWords);
    const refreshed = await apiClient.listWords(activeWordbook.id);
    setWordbooks((current) => updateWordbookWords(current, activeWordbook.id, () => refreshed));
    setMessage("샘플 영어 단어를 넣었습니다.");
    resetStudySession();
  }

  async function handleDeleteWord(wordId: string) {
    await apiClient.deleteWord(wordId);
    if (!activeWordbook) {
      return;
    }
    setWordbooks((current) => updateWordbookWords(current, activeWordbook.id, (words) => words.filter((word) => word.id !== wordId)));
    setSelectedCell(null);
    resetStudySession();
  }

  async function handleImport() {
    if (!activeWordbook) {
      return;
    }

    try {
      const parsed = parseWordMarkdown(markdown);
      const words = await apiClient.batchWords(activeWordbook.id, parsed);
      const refreshed = await apiClient.listWords(activeWordbook.id);
      setWordbooks((current) => updateWordbookWords(current, activeWordbook.id, () => refreshed));
      setMessage(`${words.length}개 단어를 가져왔습니다.`);
      resetStudySession();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "가져오기에 실패했습니다.");
    }
  }

  function handleExport() {
    if (!activeWordbook) {
      return;
    }
    setMarkdown(serializeWordsToMarkdown(activeWordbook.words));
    setMessage("현재 단어장을 Markdown으로 내보냈습니다.");
  }

  function goNextCard() {
    setSession((current) => (current ? nextCard(current) : current));
    setReviewState("question");
  }

  async function saveStudyResult(known: boolean) {
    if (!activeWordbook || !currentCard) {
      return;
    }
    const updated = await apiClient.studyWord(currentCard.word.id, known ? "known" : "unknown");
    setWordbooks((current) =>
      updateWordbookWords(current, activeWordbook.id, (words) => words.map((word) => (word.id === updated.id ? updated : word)))
    );
    await loadSummary();
  }

  async function handleKnown() {
    if (!currentCard) {
      return;
    }
    if (reviewState === "known-reveal") {
      void saveStudyResult(true).then(goNextCard);
      return;
    }
    if (reviewState !== "question") {
      return;
    }
    setSession((current) => (current ? revealCurrent(current) : current));
    setReviewState("known-reveal");
  }

  function handleUnknown() {
    if (!currentCard) {
      return;
    }
    if (reviewState === "unknown-reveal") {
      void saveStudyResult(false).then(goNextCard);
      return;
    }
    setSession((current) => (current ? revealCurrent(current) : current));
    setReviewState("unknown-reveal");
  }

  if (!profile) {
    return (
      <main className="login-screen">
        <form className="login-panel" onSubmit={handleLogin} aria-label="로그인">
          <div>
            <p className="eyebrow">Memory Assistant</p>
            <h1>어학 단어 학습</h1>
          </div>
          <label>
            표시 이름 또는 아이디
            <input value={loginName} onChange={(event) => setLoginName(event.target.value)} autoComplete="username" />
          </label>
          <label>
            비밀번호
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" />
          </label>
          {authError && <p className="form-error">{authError}</p>}
          <button className="primary-button" type="submit">시작하기</button>
        </form>
      </main>
    );
  }

  return (
    <main className={sidebarOpen ? "home-shell" : "home-shell sidebar-collapsed"}>
      <header className="top-nav">
        <div className="brand-area">
          <button className="icon-button" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? "암기장 목록 숨기기" : "암기장 목록 보이기"}>
            {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
          <strong>Memory Assistant</strong>
        </div>
        <nav className="main-tabs" aria-label="상단 메뉴">
          <button className={homeView === "study" ? "active" : ""} onClick={() => setHomeView("study")}>암기</button>
          <button className={homeView === "edit" ? "active" : ""} onClick={() => setHomeView("edit")}>단어장 편집</button>
          <button className={homeView === "profile" ? "active" : ""} onClick={() => setHomeView("profile")}>프로필</button>
        </nav>
        <div className="profile-chip">
          <span>{profile.displayName}</span>
          <button className="icon-button" onClick={handleLogout} aria-label="로그아웃" title="로그아웃">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <aside className="memory-sidebar" aria-label="암기장 목록">
        <section className="wordbook-create" aria-label="단어장 만들기">
          <h2>암기장</h2>
          <form className="create-row" onSubmit={handleCreateWordbook}>
            <input
              value={newWordbookName}
              onChange={(event) => setNewWordbookName(event.target.value)}
              placeholder="예: 토익 Day 1"
              aria-label="새 단어장 이름"
              disabled={loading}
            />
            <button className="icon-button" type="submit" aria-label="단어장 만들기" title="단어장 만들기" disabled={loading}>
              <Plus size={18} />
            </button>
          </form>
        </section>

        <nav className="wordbook-list" aria-label="단어장 목록">
          {wordbooks.map((wordbook) => (
            <button
              key={wordbook.id}
              className={wordbook.id === activeWordbook?.id ? "wordbook-item active" : "wordbook-item"}
              onClick={() => selectWordbook(wordbook)}
            >
              <BookOpen size={16} />
              <span>{wordbook.name}</span>
              <small>{wordbook.words.length}</small>
            </button>
          ))}
        </nav>
      </aside>

      <section className="home-content">
        {loading && <p className="status-line">불러오는 중...</p>}
        {appError && <p className="form-error">{appError}</p>}
        {homeView === "study" && (
          <section className="study-home" aria-label="암기 홈">
            <div className="study-header">
              <div>
                <p className="eyebrow">현재 암기장</p>
                <h1>{activeWordbook?.name ?? "암기장을 선택하세요"}</h1>
              </div>
            </div>

            <div className="notebook-stage">
              {currentCard ? (
                <article className="memory-card notebook-card" aria-label="단어 암기장">
                  <section className="notebook-section notebook-question" aria-label="앞면">
                    <strong className="study-term">{currentCard.prompt}</strong>
                  </section>
                  <section className={session?.revealed ? "notebook-section notebook-answer revealed" : "notebook-section notebook-answer"} aria-label="뒷면">
                    {session?.revealed ? <strong className="study-answer">{currentCard.answer}</strong> : null}
                  </section>
                </article>
              ) : (
                <article className="memory-card notebook-card empty-notebook" aria-label="단어 암기장">
                  <strong>{session ? "세션을 마쳤습니다." : "세션을 시작하세요."}</strong>
                </article>
              )}
            </div>

            <div className="study-actions">
              {session && currentCard && (
                <>
                  <button className="ghost-button large-action" onClick={handleUnknown} disabled={reviewState === "known-reveal"}>
                    {reviewState === "unknown-reveal" ? "다음" : "모르겠음"}
                  </button>
                  <button className="primary-button large-action" onClick={handleKnown} disabled={reviewState === "unknown-reveal"}>
                    {reviewState === "known-reveal" ? "다음" : "알고 있음"}
                  </button>
                </>
              )}
            </div>
          </section>
        )}

        {homeView === "edit" && activeWordbook && (
          <section className="edit-home" aria-label="단어장 편집">
            <header className="workspace-header">
              <form onSubmit={handleRenameWordbook} className="rename-form">
                <input
                  value={editingWordbookName || activeWordbook.name}
                  onChange={(event) => setEditingWordbookName(event.target.value)}
                  aria-label="단어장 이름"
                />
                <button className="icon-button" type="submit" aria-label="단어장 이름 저장" title="단어장 이름 저장">
                  <Check size={18} />
                </button>
              </form>
              <button className="danger-button" onClick={() => handleDeleteWordbook(activeWordbook.id)}>
                <Trash2 size={16} />
                삭제
              </button>
            </header>

            <div className="edit-grid">
              <section className="panel word-panel">
                <div className="panel-heading excel-heading">
                  <div>
                    <p className="eyebrow">Workbook Sheet</p>
                    <h2>단어 편집</h2>
                  </div>
                  <span>{activeWordbook.words.length}개 저장됨</span>
                </div>

                <div className="word-entry-panel">
                  <div className="sheet-toolbar">
                    <p className="sheet-hint">엑셀에서 두 열을 복사한 뒤 첫 칸에 붙여넣을 수 있습니다.</p>
                    <div className="button-group">
                      <button className="ghost-button" type="button" onClick={() => addDraftRows()}>
                        <Plus size={16} />
                        줄 추가
                      </button>
                      <button className="ghost-button" type="button" onClick={handleAddSampleWords}>
                        샘플 넣기
                      </button>
                      <button className="primary-button" type="button" onClick={handleSaveDraftRows}>
                        단어 저장
                      </button>
                    </div>
                  </div>

                  <div className="sheet-grid excel-sheet" role="table" aria-label="단어 추가 및 삭제표">
                    <div className="sheet-row sheet-columns" role="row">
                      <span />
                      <span>A</span>
                      <span>B</span>
                      <span>C</span>
                      <span>D</span>
                    </div>
                    <div className="sheet-row sheet-head" role="row">
                      <span>#</span>
                      <span>질문</span>
                      <span>답변</span>
                      <span>최근 학습</span>
                      <span>관리</span>
                    </div>
                    {activeWordbook.words.map((word, index) => {
                      const rowId = `saved-${word.id}`;
                      return (
                      <div className="sheet-row saved-sheet-row" role="row" key={word.id}>
                        <span>{index + 1}</span>
                        <span className={sheetCellClass(rowId, "question")} onClick={() => selectSheetCell(rowId, "question")}>{word.key}</span>
                        <span className={sheetCellClass(rowId, "answer")} onClick={() => selectSheetCell(rowId, "answer")}>{word.value}</span>
                        <span className="sheet-cell muted-cell" onClick={() => setSelectedCell(null)}>{word.lastViewedAt ? new Date(word.lastViewedAt).toLocaleString() : "-"}</span>
                        <span className="sheet-action-cell">
                          <button className="icon-button" onClick={() => handleDeleteWord(word.id)} aria-label={`${word.key} 삭제`} title="삭제">
                            <Trash2 size={16} />
                          </button>
                        </span>
                      </div>
                      );
                    })}
                    {draftRows.map((row, index) => {
                      const rowId = `draft-${index}`;
                      return (
                      <div className="sheet-row draft-sheet-row" role="row" key={index}>
                        <span>{activeWordbook.words.length + index + 1}</span>
                        <input
                          className={sheetCellClass(rowId, "question", "sheet-input")}
                          value={row.question}
                          onChange={(event) => updateDraftRow(index, "question", event.target.value)}
                          onFocus={() => selectSheetCell(rowId, "question")}
                          onPaste={(event) => handleDraftPaste(event, index, "question")}
                          placeholder={index === 0 ? "apple" : ""}
                          aria-label={`질문 ${index + 1}`}
                        />
                        <input
                          className={sheetCellClass(rowId, "answer", "sheet-input")}
                          value={row.answer}
                          onChange={(event) => updateDraftRow(index, "answer", event.target.value)}
                          onFocus={() => selectSheetCell(rowId, "answer")}
                          onPaste={(event) => handleDraftPaste(event, index, "answer")}
                          placeholder={index === 0 ? "사과" : ""}
                          aria-label={`답변 ${index + 1}`}
                        />
                        <span className="sheet-cell muted-cell" onClick={() => setSelectedCell(null)}>새 단어</span>
                        <span className="sheet-action-cell">
                          <button className="icon-button" onClick={() => clearDraftRow(index)} aria-label={`입력 ${index + 1} 지우기`} title="입력 지우기" type="button">
                            <Trash2 size={16} />
                          </button>
                        </span>
                      </div>
                      );
                    })}
                    {Array.from({ length: BLANK_SHEET_ROW_COUNT }, (_, index) => (
                      <div className="sheet-row blank-sheet-row" role="row" key={`blank-${index}`} aria-hidden="true">
                        <span>{activeWordbook.words.length + draftRows.length + index + 1}</span>
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="panel import-panel">
                <div className="panel-heading">
                  <h2>파일 가져오기</h2>
                  <div className="button-group">
                    <button className="ghost-button" onClick={handleImport} type="button">
                      <Upload size={16} />
                      가져오기
                    </button>
                    <button className="ghost-button" onClick={handleExport} type="button">
                      <Download size={16} />
                      내보내기
                    </button>
                  </div>
                </div>
                <textarea
                  value={markdown}
                  onChange={(event) => setMarkdown(event.target.value)}
                  placeholder="| question | answer | lastViewedAt |"
                  aria-label="Markdown 가져오기 내보내기"
                />
                {message && <p className="status-line">{message}</p>}
              </section>
            </div>
          </section>
        )}

        {homeView === "profile" && (
          <section className="profile-home" aria-label="프로필">
            <h1>프로필</h1>
            <div className="profile-stats">
              <div>
                <span>{summary.cumulativeLearningDays}</span>
                <small>누적 학습일</small>
              </div>
              <div>
                <span>{summary.todayStudiedCount}</span>
                <small>오늘 학습한 단어</small>
              </div>
              <div>
                <span>{wordbooks.length}</span>
                <small>암기장</small>
              </div>
            </div>
            <section className="recent-list" aria-label="최근 단어장">
              <h2>최근 단어장</h2>
              {recentWordbooks.map((wordbook) => (
                <button key={wordbook.wordbookId} onClick={() => setActiveWordbookId(wordbook.wordbookId)}>
                  {wordbook.name}
                </button>
              ))}
            </section>
          </section>
        )}
      </section>
    </main>
  );
}
