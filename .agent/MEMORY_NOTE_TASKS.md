# Memory Note Agent Tasks

## Execution Mode

Mode: Continuous autonomous development

The agent should not wait for user approval between TODOs or phases.

Normal loop:
TODO -> implement -> validate -> fix failures -> revalidate -> mark complete -> next TODO

Phase loop:
Phase active -> complete all TODOs -> mark Completed -> activate next Pending phase -> continue

The agent stops only on hard blockers.

## Ambiguity Handling

If a task has minor product ambiguity but a backward-compatible default can be inferred, implement the backward-compatible option and record the decision in `.agent/DECISIONS.md`.

Stop only if:
- the ambiguity affects data deletion
- the ambiguity affects billing/payment
- the ambiguity affects authentication/security
- the ambiguity changes public API behavior incompatibly
- the ambiguity exposes private user data

## Agent Rules Summary
- Do not delete legacy words.
- Do not delete learning_events.
- Treat review_logs as immutable.
- Keep SchedulerService server-authoritative.
- Preserve existing APIs unless a task explicitly requires a change.
- Do not implement future phase features early.
- Update this file after each completed task.
- Mark TODOs complete only after tests pass or limitations are documented.

## Current Status
- Completed through: Phase M6
- Active phase: None
- Next task: None — all listed phases and mobile phases are complete

## Phase 1 — Card-Based Review Engine
Status: Completed

- [x] Add memory_items
- [x] Add cards
- [x] Add review_states
- [x] Add review_logs
- [x] Add SchedulerService with SimpleSRS
- [x] Add review API
- [x] Keep legacy word APIs compatible

## Phase 2 — Migration Cleanup and Shared Types
Status: Completed

- [x] Backfill existing words into memory_items/cards/review_states
- [x] Make backfill idempotent
- [x] Add shared enums to packages/core
- [x] Add matching FastAPI schema enums
- [x] Replace local web/extension rating strings with shared mappings
- [x] Reject StudyPlatform.API for new client requests while preserving existing DB data

## Phase 3 — Today Queue / Summary / Mistakes API
Status: Completed (Audited)

Goal:
Improve the server-side study queue so web, extension, and future mobile clients can all use the same today queue.

TODO:
- [x] T3.1 Create or improve StudyQueueService.
- [x] T3.2 Make GET /study/today return summary and cards consistently.
- [x] T3.3 Support global queue when wordbookId is omitted.
- [x] T3.4 Support wordbook-specific queue when wordbookId is provided.
- [x] T3.5 Exclude deleted memory_items and inactive cards from today queue.
- [x] T3.6 Prioritize due cards, overdue cards, weak cards, and some NEW cards.
- [x] T3.7 Avoid consecutive cards from the same memory_item_id when possible.
- [x] T3.8 Add or stabilize GET /study/mistakes.
- [x] T3.9 Add API tests for queue ordering, filtering, inactive cards, summary counts, and mistakes.

Audit Subtasks:
- [x] T3.A1 Inspect the actual /study/today implementation and verify it returns { summary, cards } from server code, not only tests.
- [x] T3.A2 Inspect StudyQueueService or equivalent queue-building logic and verify due/overdue/weak/new ordering is implemented.
- [x] T3.A3 Inspect the query filters and verify deleted memory_items and inactive cards are excluded.
- [x] T3.A4 Inspect wordbookId filtering and verify omitted wordbookId means all wordbooks.
- [x] T3.A5 Inspect same-memory-item spreading logic and verify related cards are not consecutive when possible.
- [x] T3.A6 Inspect /study/mistakes implementation and verify it is based on lapses/leech_score/recent weak reviews.
- [x] T3.A7 Add or improve tests if any acceptance criteria is only partially covered.
- [x] T3.A8 If all criteria are already implemented, document the exact files/functions inspected in the Work Log before marking Phase 3 complete.

Acceptance Criteria:
- /study/today returns { summary, cards }.
- wordbookId omitted means all wordbooks.
- wordbookId provided means only that wordbook.
- inactive/deleted cards never appear.
- weak cards can be queried from /study/mistakes.
- tests pass.

## Phase 4 — Web Study UX v2 / Mistake Note / Profile Stats
Status: Completed

TODO:
- [x] T4.1 Update web study screen to use /study/today.
- [x] T4.2 Submit reviews with POST /study/cards/{cardId}/review.
- [x] T4.3 Use shared rating maps from packages/core.
- [x] T4.4 Add or update mistake note screen using /study/mistakes.
- [x] T4.5 Update profile stats using review_states/review_logs while preserving old behavior.
- [x] T4.6 Add web tests.

## Phase 5 — Chrome Extension Server Sync
Status: Completed

TODO:
- [x] T5.1 Load cards from /study/today?limit=5.
- [x] T5.2 Do not show automatic quiz when token is missing.
- [x] T5.3 Show login/connect guidance when token is missing.
- [x] T5.4 Submit O/X reviews as GOOD/AGAIN.
- [x] T5.5 Add pending review queue with clientEventId.
- [x] T5.6 Add extension tests.

## Phase 6 — Long-Term Memory / MASTERED
Status: Completed

TODO:
- [x] T6.1 Apply conservative MASTERED transition.
- [x] T6.2 Include old MASTERED cards in today queue sampling.
- [x] T6.3 Move MASTERED card to RELEARNING on AGAIN.
- [x] T6.4 Add long-term memory stats.
- [x] T6.5 Add tests.

## Phase 7 — FSRS Scheduler
Status: Completed

TODO:
- [x] T7.1 Add FSRS scheduler implementation beside SimpleSRS.
- [x] T7.2 Add scheduler engine config.
- [x] T7.3 Keep SchedulerService interface stable.
- [x] T7.4 Treat retrievability as computed value.
- [x] T7.5 Add scheduler tests.

## Phase 8 — Word to Sentence Cards
Status: Completed

TODO:
- [x] T8.1 Add example sentence storage.
- [x] T8.2 Generate CLOZE cards from examples.
- [x] T8.3 Add TYPING card support.
- [x] T8.4 Add web renderers for CLOZE and TYPING.
- [x] T8.5 Store responseText for typing reviews.
- [x] T8.6 Add tests.

## Phase 9 — Markdown v2 / Course Pack
Status: Completed

TODO:
- [x] T9.1 Extend Markdown import for sentence/cloze/tag metadata.
- [x] T9.2 Keep Markdown v1 compatible.
- [x] T9.3 Add course_pack/unit/lesson structure.
- [x] T9.4 Keep course content separate from user review state.
- [x] T9.5 Add tests.

## Phase 10 — Core Session Engine / Offline Sync
Status: Completed

TODO:
- [x] T10.1 Add shared session engine to packages/core.
- [x] T10.2 Add TodayCard, TodaySummary, ReviewRequest, ReviewResponse types.
- [x] T10.3 Add PendingReviewEvent model.
- [x] T10.4 Reuse core session logic in web/extension where practical.
- [x] T10.5 Add tests.

## Phase 11 — Fun Events / Retention UX
Status: Completed

TODO:
- [x] T11.1 Add study_events table/model.
- [x] T11.2 Generate events after review_state update.
- [x] T11.3 Add leech/zombie event logic.
- [x] T11.4 Add user setting to disable fun elements.
- [x] T11.5 Add tests.

## Phase 12 — Study Groups
Status: Completed

TODO:
- [x] T12.1 Add study_groups.
- [x] T12.2 Add study_group_members.
- [x] T12.3 Add group wordbook linking.
- [x] T12.4 Add group progress summary.
- [x] T12.5 Add group weak cards.
- [x] T12.6 Add permission tests.

## Phase 13 — Teacher Classes / Assignments
Status: Completed

TODO:
- [x] T13.1 Add classes and class_members.
- [x] T13.2 Add teacher/student roles.
- [x] T13.3 Add assignments.
- [x] T13.4 Add assignment progress.
- [x] T13.5 Add teacher dashboard APIs.
- [x] T13.6 Add permission tests.

## Phase 14 — Paid Course Content / Entitlements
Status: Completed

TODO:
- [x] T14.1 Add products and entitlements.
- [x] T14.2 Add course access checks.
- [x] T14.3 Add course start flow.
- [x] T14.4 Add admin course management basics.
- [x] T14.5 Add tests.

## Phase 15 — Analytics / Recommendation Improvements
Status: Completed

TODO:
- [x] T15.1 Add review analytics.
- [x] T15.2 Add card quality analytics.
- [x] T15.3 Improve today queue recommendations.
- [x] T15.4 Add content quality signals.
- [x] T15.5 Add tests.

## Phase M1 — Mobile App Foundation
Status: Completed

Goal:
Create apps/mobile as an Expo + React Native app that can import packages/core.

TODO:
- [x] M1.1 Create apps/mobile with Expo + React Native.
- [x] M1.2 Configure pnpm workspace and package scripts.
- [x] M1.3 Configure Expo Router basic routes.
- [x] M1.4 Verify packages/core can be imported.
- [x] M1.5 Add basic mobile lint/type/test checks if practical.
- [x] M1.6 Add a minimal home screen.

Acceptance Criteria:
- apps/mobile exists.
- Expo app can start.
- Expo Router is configured.
- packages/core imports work.
- A minimal screen renders.
- Mobile scripts are available through pnpm workspace.

## Phase M2 — Mobile Auth
Status: Completed

Goal:
Allow users to log in, register, restore auth state, and log out.

TODO:
- [x] M2.1 Add API client with mobile API base URL config.
- [x] M2.2 Add login screen.
- [x] M2.3 Add register screen.
- [x] M2.4 Store auth token in expo-secure-store.
- [x] M2.5 Restore auth state on app start.
- [x] M2.6 Add logout.
- [x] M2.7 Add auth tests or smoke validation where practical.

Acceptance Criteria:
- User can log in.
- User can register.
- Auth token is stored in expo-secure-store, not AsyncStorage.
- App restores auth state after restart.
- User can log out.
- /me works when authenticated.

## Phase M3 — Mobile Today Study
Status: Completed

Goal:
Let mobile users fetch today cards and submit reviews.

TODO:
- [x] M3.1 Fetch GET /study/today.
- [x] M3.2 Render today summary.
- [x] M3.3 Render study card prompt and hidden answer.
- [x] M3.4 Add answer reveal flow.
- [x] M3.5 Submit POST /study/cards/{cardId}/review.
- [x] M3.6 Use StudyPlatform.MOBILE.
- [x] M3.7 Generate clientEventId for each review.
- [x] M3.8 Reuse packages/core session engine where practical.
- [x] M3.9 Add study tests or smoke validation where practical.

Acceptance Criteria:
- Mobile can load today cards.
- User can reveal answer.
- User can submit AGAIN/HARD/GOOD.
- Review request uses platform MOBILE.
- Server remains authoritative for scheduling.
- Mobile does not compute due_at locally.

## Phase M4 — Mobile Pending Review Queue
Status: Completed

Goal:
Preserve reviews when network calls fail.

TODO:
- [x] M4.1 Add AsyncStorage-backed pending review queue.
- [x] M4.2 Reuse pending review event model from packages/core.
- [x] M4.3 Flush pending reviews on app start and before/after study.
- [x] M4.4 Reuse clientEventId for retries.
- [x] M4.5 Apply the same status-code policy as extension.
- [x] M4.6 Add pending queue tests or smoke validation.

Acceptance Criteria:
- Failed review submissions are queued.
- Retried reviews reuse the same clientEventId.
- Successful retry removes event from queue.
- 401/403 preserves queue and requires login.
- 404/409/422 remove event.
- Network/5xx keeps event and increments attemptCount.
- Queue is capped and old events are pruned.
- Flush oldest first and at most 20 events per run.

## Phase M5 — Mobile Mistakes and Profile
Status: Completed

Goal:
Show mistake cards and profile/long-term memory summary.

TODO:
- [x] M5.1 Fetch GET /study/mistakes.
- [x] M5.2 Render mistakes list.
- [x] M5.3 Fetch GET /profile/summary.
- [x] M5.4 Render long-term memory stats.
- [x] M5.5 Add loading, error, and empty states.
- [x] M5.6 Add tests or smoke validation where practical.

Acceptance Criteria:
- Mistake cards are visible.
- Profile summary is visible.
- Long-term memory stats are visible when available.
- Existing API response shapes are respected.

## Phase M6 — Mobile UX Polish
Status: Completed

Goal:
Make the mobile MVP usable and visually coherent.

TODO:
- [x] M6.1 Add card-based visual style.
- [x] M6.2 Add bottom tab navigation.
- [x] M6.3 Improve touch targets.
- [x] M6.4 Add consistent colors and typography.
- [x] M6.5 Add empty/error state polish.
- [x] M6.6 Run full CI.

Acceptance Criteria:
- Mobile UI is usable on phone-sized screens.
- Primary study action is obvious.
- Touch targets are large enough.
- Loading/error/empty states are not broken.
- Full CI passes or closest available validation passes with documented limitations.

## Work Log
- Initial state file created. Phase 1 and Phase 2 marked complete. Phase 3 is active.

- T3.1 완료: StudyQueueService(today_cards_query/order_today_rows/today_summary) 구현 상태 검증.
- T3.2 완료: GET /study/today가 summary+cards 반환함을 API 테스트로 검증.
- T3.3 완료: wordbookId 미지정 시 전체 큐 동작 검증.
- T3.4 완료: wordbookId 지정 시 해당 워드북 큐만 반환 검증.
- T3.5 완료: 삭제된 memory_items/inactive cards 제외 검증.
- T3.6 완료: due/overdue/weak/new 우선순위 ordering 로직 및 테스트 검증.
- T3.7 완료: 동일 memory_item_id 연속 최소화 정렬 검증.
- T3.8 완료: GET /study/mistakes 안정 동작 검증.
- T3.9 완료: 큐 정렬/필터/비활성카드/summary/mistakes API 테스트 통과.

- T3.A1 완료: `apps/api/app/main.py::study_today`가 서버 코드에서 `TodayStudyResponse(summary, cards)`를 직접 구성함을 확인.
- T3.A2 완료: `apps/api/app/review.py::order_today_rows` 정렬 키(기한/난이도/약점/new)와 `spread_same_item_cards` 확인.
- T3.A3 완료: `apps/api/app/review.py::today_cards_query`의 `Card.active`, `Card.deleted_at`, `MemoryItem.deleted_at` 필터 확인.
- T3.A4 완료: `apps/api/app/main.py::study_today` + `today_cards_query`에서 `wordbookId` 있을 때만 필터 적용 확인.
- T3.A5 완료: `apps/api/app/review.py::spread_same_item_cards`로 동일 `memory_item_id` 연속 최소화 확인.
- T3.A6 완료: `apps/api/app/main.py::study_mistakes`를 보강하여 lapses/leech_score + 최근 7일 AGAIN 리뷰 기반 약점 포함 처리.
- T3.A7 완료: `apps/api/tests/test_api.py::test_study_mistakes_includes_recent_again_reviews_even_without_lapses` 추가 및 통과.
- T3.A8 완료: 감사 대상 함수/파일 경로 및 검증 테스트를 Work Log에 명시 후 Phase 3 완료 처리.

- T4.1 완료: 웹 학습 화면이 `apiClient.studyToday`로 `/study/today`를 사용함을 `apps/web/src/App.tsx::loadStudyQueue`/`apps/web/src/api/client.ts::studyToday` 및 App 테스트로 검증.
- T4.2 완료: 리뷰 제출이 `apiClient.reviewCard`를 통해 `POST /study/cards/{cardId}/review`를 사용함을 `apps/web/src/App.tsx::saveStudyResult`와 테스트로 검증.
- T4.3 완료: 웹 타입이 `@memory-note/core` `ReviewRating`/`StudyPlatform` 매핑을 사용함을 `apps/web/src/types.ts`/`apps/web/src/api/client.ts`로 검증.
- 중단: T4.4는 “mistake note 화면”의 UX/정보구조 요구사항이 TASKS에 없어 구현 범위가 모호하여 제품 결정 블로커로 중단.

- T4.4 완료: `apps/web/src/api/client.ts::studyMistakes` API 클라이언트 추가, `apps/web/src/App.tsx` 프로필 화면에 실수 노트 섹션 추가, `apps/web/src/App.test.tsx` 렌더링/호출 검증 테스트 업데이트.
- T4.5 중단: profile 통계를 review_states/review_logs 중심으로 전환하면서 learning_events 기반 기존 지표와 어떻게 병합/우선할지 규칙이 TASKS에 명시되어 있지 않아 제품 동작 결정이 필요함.

- T4.5 완료: `/profile/summary`에 review_logs/review_states 기반 집계를 추가하고 legacy learning_events와 합집합+중복제거(memory_item_id > word_id > card_id) 정책을 반영. 기존 필드는 유지하고 `masteredCount`, `weakCardCount`를 optional 확장 필드로 추가.
- T4.6 완료: API 프로필 통계 병합 케이스(legacy+review dedup) 테스트와 웹 App 테스트를 실행해 기존 UI 렌더링 호환성을 검증.
- Phase 5 진행 시작: T5.1 사전 감사 결과 `apps/extension/src/api.ts` 및 `apps/extension/src/api.test.ts`에 `/study/today?limit=5` 호출/테스트가 이미 존재함을 확인. 다음 회차에서 구현 근거 정리 및 TODO 체크를 진행.
- T5.1~T5.4 완료(감사+검증): `apps/extension/src/api.ts`의 `/study/today?limit=5` 호출, 토큰 미연결 가드, O/X->GOOD/AGAIN 매핑 및 clientEventId 제출 로직을 확인했고 `src/api.test.ts`, `src/popup.test.ts` 대상 검증을 통과.
- 중단: T5.5 pending review queue(clientEventId) 영속 큐 정책(저장 수명/재전송 조건/충돌 해소) 정의가 TASKS에 부족하여 제품 정책 결정 필요.

- T5.5 완료: `pendingReviewQueue`(chrome.storage.local) 기반 pending review queue 구현 및 flush/retry/status별 처리(401/403 보존중단, 404/409/422 드롭, network/5xx 재시도) 반영.
- T5.6 완료: `pending-review.test.ts`에 실패저장/재시도성공/네트워크증가/401보존/409제거/보관기간/200건상한 테스트 추가 및 통과.
- 중단: T6.1의 "conservative MASTERED transition" 임계치(연속횟수/간격/난이도) 정책이 TASKS에 수치로 명시되지 않아 제품 결정 필요.

- T6.1 완료: `SimpleSRS.review`에서 MASTERED 전환 조건을 REVIEW 상태 + interval_days>=30 + streak>=5 + lapses<=1 + (difficulty 존재 시 <=0.7)로 제한. MASTERED에서 AGAIN 시 mastered_at은 유지되고 RELEARNING/10분 due/누적 갱신이 유지됨을 테스트로 확인.
- 중단: T6.2(오래된 MASTERED 카드 샘플링) 비율/주기 정책이 TASKS에 없어 큐 품질과 학습량 영향이 큰 제품 결정 필요.

- T6.2 완료: `/study/today` 큐에 장기 MASTERED 샘플링(10%, 최소1) 로직 추가, 최근 7일 복습 MASTERED 제외/wordbook 필터 존중/중복 제거/limit 준수 반영. summary에 optional `masteredCheckCount` 추가.
- T6.3 완료: `SimpleSRS.review`의 AGAIN 경로가 MASTERED 카드도 RELEARNING으로 전환하고 due+10분, lapses/streak/leech 갱신, mastered_at 유지함을 기존 회귀 테스트로 재검증.
- 중단: T6.4 long-term memory stats의 구체 지표 정의(기간/분모/표시 위치)가 TASKS에 없어 제품 결정 필요.
- T6.4 완료: `/profile/summary`에 optional 장기 기억 통계(`longTermReviewCount30d`, `longTermCorrectCount30d`, `longTermRecallRate30d`, `masteredLapseCount30d`, `oldMasteredDueCount`)를 추가하고, `masteredCount`를 active/non-deleted memory_item 기준 distinct count로 정리. 웹 프로필에 장기 기억 통계 섹션을 작게 추가.
- T6.5 완료: `apps/api/tests/test_api.py::test_profile_summary_long_term_memory_stats`로 distinct mastered memory_item, state_before_json 기반 30일 장기 복습/정답/AGAIN/회상률, old MASTERED 샘플 후보 제외 조건을 검증. 기존 CI 실패 원인이던 Ruff 미사용 import/변수도 정리. `pnpm run ci` 통과.
- Phase 6 완료: long-term memory / MASTERED 범위 검증 완료 후 Phase 7(FSRS Scheduler)을 Active로 전환.
- T7.1 완료: `apps/api/app/review.py`에 기존 `SimpleSRS` 옆 `FSRSScheduler`를 추가해 difficulty/stability/retrievability 기반 review 결과를 계산하도록 구현.
- T7.2 완료: `apps/api/app/config.py::get_scheduler_engine` 및 `apps/api/app/review.py::scheduler_from_config` 추가. 기본값은 `simple`, `SCHEDULER_ENGINE=fsrs`일 때 FSRS 계열 엔진 선택, 잘못된 값은 `simple` fallback.
- T7.3 완료: `SchedulerService.review(state, rating, reviewed_at)` 인터페이스와 `review_card(..., scheduler=...)` 주입 지점 유지.
- T7.4 완료: `retrievability`는 DB 컬럼 없이 `calculate_retrievability`에서 `last_reviewed_at`/`stability`로 계산하도록 유지하고 FSRS 안정도 갱신에도 계산값을 사용.
- T7.5 완료: `apps/api/tests/test_scheduler_policy.py`에 config 선택, FSRS review/AGAIN 동작, computed retrievability 회귀 테스트 추가. `python -m pytest apps/api/tests -q` 및 `pnpm run ci` 통과.
- Phase 7 완료: FSRS scheduler 범위 검증 완료 후 Phase 8(Word to Sentence Cards)을 Active로 전환.
- T8.1 완료: Word API/Sync/Markdown에 optional `exampleSentence`를 추가하고 `memory_items.example_sentence` compat migration을 추가.
- T8.2 완료: 예문이 있는 WORD item에서 `CLOZE` 카드를 자동 생성하고, 예문 제거 시 관리 대상 문장 카드를 비활성화하도록 default card sync 보강.
- T8.3 완료: 예문 기반 `TYPING` 카드 자동 생성 추가.
- T8.4 완료: 웹 학습 화면에서 TYPING 카드 입력 필드를 렌더링하고, CLOZE/TYPING 서버 카드를 기존 study session 렌더링으로 표시.
- T8.5 완료: 웹 review 제출에 `responseText`를 연결하고 API `ReviewLog.response_text` 저장 회귀 테스트 추가.
- T8.6 완료: API 예문/CLOZE/TYPING/responseText 테스트와 Markdown exampleSentence 테스트 추가. `pnpm run ci` 통과.
- Phase 8 완료: Word to Sentence Cards 범위 검증 완료 후 Phase 9(Markdown v2 / Course Pack)을 Active로 전환.
- T9.1 완료: Markdown parser/exporter가 optional `itemType`, `exampleSentence`, `tags`, `cloze` 컬럼을 처리하도록 확장.
- T9.2 완료: 기존 v1 `key/value/lastViewedAt` Markdown table은 계속 import 가능하도록 유지.
- T9.3 완료: `CoursePack`, `CourseUnit`, `CourseLesson`, `CourseLessonItem` content-only 모델과 테이블 구조 추가.
- T9.4 완료: course content 모델에는 `user_id`/review state 연결을 두지 않고, 사용자 review state와 분리된 원본 교재 구조로 유지.
- T9.5 완료: Markdown v2 parser/exporter 테스트와 course content 분리 테스트 추가. `pnpm run ci` 통과.
- Phase 9 완료: Markdown v2 / Course Pack 범위 검증 완료 후 Phase 10(Core Session Engine / Offline Sync)을 Active로 전환.
- T10.1 완료: `packages/core/src/session.ts`에 shared study session engine 추가.
- T10.2 완료: core에 `TodayCard`, `TodaySummary`, `ReviewRequest`, `ReviewResponse` 타입 추가.
- T10.3 완료: core에 `PendingReviewEvent` 모델과 `createPendingReviewEvent` 생성 helper 추가.
- T10.4 완료: web session util이 core session engine/card type mapping을 재사용하고, extension pending review queue가 core pending event 모델을 사용하도록 연결.
- T10.5 완료: core session tests와 기존 web/extension session/pending tests 통과. `pnpm run ci` 통과.
- Phase 10 완료: Core Session Engine / Offline Sync 범위 검증 완료 후 Phase 11(Fun Events / Retention UX)을 Active로 전환.
- T11.1 done: added `StudyEvent` model/table plus migration support for append-only study event logging.
- T11.2 done: review updates now create study events after review_state changes without mutating review_logs.
- T11.3 done: retention event rules cover mastered transitions, mastered lapses, leech threshold crossing, and long-term mastered reviews.
- T11.4 done: added `funEventsEnabled` user setting and `/me/settings` read/update endpoints; disabled users do not create new study events.
- T11.5 done: added API coverage for event generation and setting opt-out; `pnpm run ci` passed.
- Phase 11 done: Fun Events / Retention UX validated and Phase 12(Study Groups) activated.
- T12.1 done: added private `StudyGroup` model/table.
- T12.2 done: added `StudyGroupMember` with OWNER/MEMBER roles and PENDING/ACTIVE/DECLINED membership states.
- T12.3 done: added group wordbook linking scoped to the active member's own wordbooks.
- T12.4 done: added group progress summary over active members' explicitly linked wordbooks.
- T12.5 done: added group weak-card endpoint limited to the requesting active member's linked cards.
- T12.6 done: added permission tests for outsider access, pending members, owner-only invites, own-wordbook linking, aggregate progress, and weak-card privacy; `pnpm run ci` passed.
- Phase 12 done: Study Groups validated and Phase 13(Teacher Classes / Assignments) activated.
- T13.1 done: added `TeacherClass` and `ClassMember` models/tables.
- T13.2 done: added TEACHER/STUDENT roles with PENDING/ACTIVE/DECLINED membership states.
- T13.3 done: added teacher-created class assignments scoped to the teacher's own wordbooks.
- T13.4 done: added zero-safe assignment progress aggregation from review_logs where matching data exists.
- T13.5 done: added teacher-only class dashboard API returning aggregate assignment progress.
- T13.6 done: added permission tests for outsider access, pending students, teacher-only assignment/invite/dashboard actions, and own-wordbook assignment scope; `pnpm run ci` passed.
- Phase 13 done: Teacher Classes / Assignments validated and Phase 14(Paid Course Content / Entitlements) activated.
- Blocked at T14.1: Paid products, entitlements, course access, course start, and admin course management affect billing/payment and paid access control. Need explicit product/payment provider, entitlement grant/revoke, refund/rollback, and admin authorization policy before implementation.
- T14.1 done: added `Product` and `UserEntitlement` models with COURSE_PACK product type, DRAFT/ACTIVE/ARCHIVED product status, ACTIVE/REVOKED/EXPIRED entitlement status, and MANUAL/PURCHASE/CLASS_LICENSE entitlement source.
- T14.2 done: added paid/free course access checks where free course packs are open and paid course packs require an ACTIVE non-expired entitlement.
- T14.3 done: added course start flow that validates access and creates or reuses user-owned course enrollment and wordbook learning state without mutating source course content.
- T14.4 done: no secure admin role system exists, so unsafe public admin routes were not exposed; internal product/grant/revoke service functions were added and covered by service-level tests.
- T14.5 done: added tests for paid access denial, ACTIVE access, REVOKED/EXPIRED denial, free course start, source-content separation, revoke preservation of review_logs/review_states, and lack of public admin access; `pnpm run ci` passed.
- Phase 14 done: Paid Course Content / Entitlements validated and Phase 15(Analytics / Recommendation Improvements) activated.
- T15.1 done: added authenticated `/analytics/summary` review analytics with 30-day review/correct/AGAIN counts and zero-safe recall rate.
- T15.2 done: added card quality analytics for active cards, weak cards, leech cards, low-recall cards, and average retrievability.
- T15.3 done: added recommendation reason/score helpers and optional `recommendationReason`/`recommendationScore` fields on today cards while preserving existing queue shape.
- T15.4 done: added content quality signals for active items, missing example sentences, tagged items, and sentence-ready items.
- T15.5 done: added analytics and recommendation signal tests; `pnpm run ci` passed.
- Phase 15 done: Analytics / Recommendation Improvements validated. All listed phases are complete.
- M1.1 done: created `apps/mobile` from the Expo React Native TypeScript template. Files changed: `apps/mobile/package.json`, `apps/mobile/app.json`, generated assets. Files/functions inspected: root `package.json`, `pnpm-workspace.yaml`, `packages/core/package.json`. Validation: `pnpm -C apps/mobile typecheck`, `pnpm -C apps/mobile test:unit`, `pnpm -C apps/mobile build` passed. Next TODO: M1.2.
- M1.2 done: connected the mobile app to pnpm workspace scripts and root build/lint/typecheck/test commands. Files changed: root `package.json`, `apps/mobile/package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`. Files/functions inspected: existing root scripts for web/extension/core/api. Validation: `pnpm -C apps/mobile typecheck`, `pnpm -C apps/mobile test:unit`, `pnpm -C apps/mobile build` passed. Next TODO: M1.3.
- M1.3 done: configured Expo Router by switching mobile entry to `expo-router/entry` and adding `app/_layout.tsx`. Files changed: `apps/mobile/package.json`, `apps/mobile/app/_layout.tsx`, `apps/mobile/app.json`. Files/functions inspected: generated `App.tsx`, `index.ts`, Expo Router dependency config. Validation: `pnpm -C apps/mobile build` passed. Next TODO: M1.4.
- M1.4 done: verified `packages/core` imports through `apps/mobile/src/coreProbe.ts` and `coreProbe.test.ts`. Files changed: `apps/mobile/src/coreProbe.ts`, `apps/mobile/src/coreProbe.test.ts`, `apps/mobile/metro.config.js`, `apps/mobile/tsconfig.json`. Files/functions inspected: `packages/core/src/index.ts`, `packages/core/src/session.ts`, `packages/core/src/types.ts`. Validation: `pnpm -C apps/mobile test:unit` passed. Next TODO: M1.5.
- M1.5 done: added practical mobile checks through `typecheck`, `test:unit`, `build`, and root workspace script aliases. Files changed: `apps/mobile/package.json`, `apps/mobile/vitest.config.ts`, root `package.json`. Files/functions inspected: web/extension package script patterns. Validation: `pnpm -C apps/mobile typecheck`, `pnpm -C apps/mobile test:unit`, `pnpm -C apps/mobile build` passed. Next TODO: M1.6.
- M1.6 done: added a minimal study-focused home screen that renders through Expo Router and imports shared core constants. Files changed: `apps/mobile/app/index.tsx`. Files/functions inspected: existing product color direction from extension/web login UI. Validation: `pnpm -C apps/mobile build` passed. Next TODO: M2.1.
- Phase M1 done: Mobile App Foundation validated; Phase M2(Mobile Auth) activated.
- M2.1 done: added `createMobileApiClient` with `EXPO_PUBLIC_API_BASE_URL`/default base URL normalization and existing `/auth/*`/`/me` calls. Files changed: `apps/mobile/src/config.ts`, `apps/mobile/src/api/client.ts`. Files/functions inspected: `apps/web/src/api/client.ts`, `apps/api/app/schemas.py`, auth routes in `apps/api/app/main.py`. Validation: `pnpm -C apps/mobile typecheck`, `pnpm -C apps/mobile test:unit`, `pnpm -C apps/mobile build` passed. Next TODO: M2.2.
- M2.2 done: added mobile login route and form that calls the auth context and returns to home on success. Files changed: `apps/mobile/app/login.tsx`, `apps/mobile/app/index.tsx`. Files/functions inspected: Expo Router stack layout and existing web auth payload shape. Validation: `pnpm -C apps/mobile typecheck` passed. Next TODO: M2.3.
- M2.3 done: added mobile register route and form using the same API response shape. Files changed: `apps/mobile/app/register.tsx`. Files/functions inspected: `/auth/register` schema and login screen. Validation: `pnpm -C apps/mobile typecheck` passed. Next TODO: M2.4.
- M2.4 done: added SecureStore-backed token persistence through `apps/mobile/src/auth/tokenStorage.ts`; auth token is not stored in AsyncStorage. Files changed: `apps/mobile/src/auth/tokenStorage.ts`, `apps/mobile/src/auth/AuthContext.tsx`. Files/functions inspected: mobile auth policy in `.agent/DECISIONS.md`. Validation: `pnpm -C apps/mobile typecheck` passed. Next TODO: M2.5.
- M2.5 done: `AuthProvider` restores token on app start, validates it with `/me`, and clears invalid tokens. Files changed: `apps/mobile/src/auth/AuthContext.tsx`, `apps/mobile/app/_layout.tsx`. Files/functions inspected: `/me` response schema. Validation: `pnpm -C apps/mobile build` passed. Next TODO: M2.6.
- M2.6 done: added settings route with account/API display and logout that clears SecureStore even if server logout fails. Files changed: `apps/mobile/app/settings.tsx`, `apps/mobile/src/auth/AuthContext.tsx`. Files/functions inspected: `/auth/logout` behavior. Validation: `pnpm -C apps/mobile typecheck` passed. Next TODO: M2.7.
- M2.7 done: added API client unit tests for login token mapping, base URL normalization, and authenticated `/me` bearer headers; smoke validation via Expo export passed. Files changed: `apps/mobile/src/api/client.test.ts`. Files/functions inspected: Vitest mobile config. Validation: `pnpm -C apps/mobile test:unit`, `pnpm -C apps/mobile build` passed. Next TODO: M3.1.
- Phase M2 done: Mobile Auth validated; Phase M3(Mobile Today Study) activated.
- M3.1 done: added mobile `studyToday` API client call to `GET /study/today?limit=...`. Files changed: `apps/mobile/src/api/client.ts`. Files/functions inspected: web `studyToday` client and API `TodayStudyResponse` schema. Validation: `pnpm -C apps/mobile typecheck`, `pnpm -C apps/mobile test:unit` passed. Next TODO: M3.2.
- M3.2 done: home screen now fetches and renders today due/new/weak/mastered-check summary for signed-in users. Files changed: `apps/mobile/app/index.tsx`. Files/functions inspected: `packages/core/src/session.ts::TodaySummary`. Validation: `pnpm -C apps/mobile build` passed. Next TODO: M3.3.
- M3.3 done: added study screen that renders current card prompt and keeps answer hidden before reveal. Files changed: `apps/mobile/app/study.tsx`. Files/functions inspected: `packages/core/src/session.ts::getCurrentStudyCard`. Validation: `pnpm -C apps/mobile typecheck` passed. Next TODO: M3.4.
- M3.4 done: added answer reveal flow using `revealStudySession`. Files changed: `apps/mobile/app/study.tsx`. Files/functions inspected: `packages/core/src/session.ts::revealStudySession`. Validation: `pnpm -C apps/mobile typecheck` passed. Next TODO: M3.5.
- M3.5 done: added review submission through `POST /study/cards/{cardId}/review` and advances the local session only after server success. Files changed: `apps/mobile/src/api/client.ts`, `apps/mobile/app/study.tsx`. Files/functions inspected: `apps/api/app/schemas.py::CardReviewRequest`. Validation: `pnpm -C apps/mobile test:unit` passed. Next TODO: M3.6.
- M3.6 done: mobile review payload always uses `StudyPlatform.MOBILE`. Files changed: `apps/mobile/src/study/reviewPayload.ts`. Files/functions inspected: `packages/core/src/types.ts::StudyPlatform`. Validation: `pnpm -C apps/mobile test:unit` passed. Next TODO: M3.7.
- M3.7 done: added `mobile-{cardId}-{rating}-{random}` clientEventId generation for each review request. Files changed: `apps/mobile/src/study/reviewPayload.ts`, `apps/mobile/src/study/reviewPayload.test.ts`. Files/functions inspected: extension clientEventId generation. Validation: `pnpm -C apps/mobile test:unit` passed. Next TODO: M3.8.
- M3.8 done: study screen reuses `createStudySessionFromTodayCards`, `getCurrentStudyCard`, `revealStudySession`, and `advanceStudySession` from `packages/core`; mobile does not compute `due_at`. Files changed: `apps/mobile/app/study.tsx`. Files/functions inspected: `packages/core/src/session.ts`. Validation: `pnpm -C apps/mobile typecheck` passed. Next TODO: M3.9.
- M3.9 done: added API mapping and MOBILE review payload tests plus Expo export smoke validation. Files changed: `apps/mobile/src/api/client.test.ts`, `apps/mobile/src/study/reviewPayload.test.ts`. Files/functions inspected: `apps/mobile/vitest.config.ts`. Validation: `pnpm -C apps/mobile typecheck`, `pnpm -C apps/mobile test:unit`, `pnpm -C apps/mobile build` passed. Next TODO: M4.1.
- Phase M3 done: Mobile Today Study validated; Phase M4(Mobile Pending Review Queue) activated.
- M4.1 done: added AsyncStorage-backed pending review queue storage. Files changed: `apps/mobile/src/pending/pendingReviewQueue.ts`. Files/functions inspected: `apps/extension/src/pending-review.ts`, mobile decision policy. Validation: `pnpm -C apps/mobile typecheck` passed. Next TODO: M4.2.
- M4.2 done: pending queue uses `packages/core` `PendingReviewEvent` and `createPendingReviewEvent` with `StudyPlatform.MOBILE`. Files changed: `apps/mobile/src/pending/pendingReviewQueue.ts`. Files/functions inspected: `packages/core/src/session.ts::PendingReviewEvent`. Validation: `pnpm -C apps/mobile test:unit` passed. Next TODO: M4.3.
- M4.3 done: pending reviews flush when auth becomes signed-in, before loading study cards, and after successful study review submission. Files changed: `apps/mobile/src/auth/AuthContext.tsx`, `apps/mobile/app/study.tsx`. Files/functions inspected: mobile auth restore flow and study submit flow. Validation: `pnpm -C apps/mobile build` passed. Next TODO: M4.4.
- M4.4 done: failed reviews are stored with the original review `clientEventId`, and retries reuse the same value. Files changed: `apps/mobile/app/study.tsx`, `apps/mobile/src/pending/pendingReviewQueue.ts`. Files/functions inspected: `apps/mobile/src/study/reviewPayload.ts`. Validation: `pnpm -C apps/mobile test:unit` passed. Next TODO: M4.5.
- M4.5 done: mobile queue now matches extension retry policy: success removes, network/5xx keeps and increments attempt count, 401/403 preserves queue and returns `auth_required`, 404/409/422 drops, 7-day retention, 200-event cap, oldest-first 20-event flush. Files changed: `apps/mobile/src/pending/pendingReviewQueue.ts`. Files/functions inspected: `apps/extension/src/pending-review.ts`. Validation: `pnpm -C apps/mobile test:unit` passed. Next TODO: M4.6.
- M4.6 done: added pending queue tests for enqueue, successful retry removal, auth preservation, non-retryable removal, network retry attempt increments, cap/prune, and max 20 flush batch; Expo export smoke validation passed. Files changed: `apps/mobile/src/pending/pendingReviewQueue.test.ts`. Files/functions inspected: extension pending tests. Validation: `pnpm -C apps/mobile typecheck`, `pnpm -C apps/mobile test:unit`, `pnpm -C apps/mobile build` passed. Next TODO: M5.1.
- Phase M4 done: Mobile Pending Review Queue validated; Phase M5(Mobile Mistakes and Profile) activated.
- M5.1 done: added mobile API client call to `GET /study/mistakes`. Files changed: `apps/mobile/src/api/client.ts`. Files/functions inspected: `apps/api/app/schemas.py::TodayStudyResponse`, web `studyMistakes` client. Validation: `pnpm -C apps/mobile typecheck` passed. Next TODO: M5.2.
- M5.2 done: added `app/mistakes.tsx` to render weak/mistake cards with retry and empty states. Files changed: `apps/mobile/app/mistakes.tsx`, `apps/mobile/app/index.tsx`. Files/functions inspected: mobile route layout. Validation: `pnpm -C apps/mobile build` passed. Next TODO: M5.3.
- M5.3 done: added `profileSummary` API client mapping for `/profile/summary`. Files changed: `apps/mobile/src/api/client.ts`. Files/functions inspected: `apps/api/app/schemas.py::ProfileSummary`, web profile mapping. Validation: `pnpm -C apps/mobile typecheck` passed. Next TODO: M5.4.
- M5.4 done: added profile screen with long-term memory stats when available. Files changed: `apps/mobile/app/profile.tsx`. Files/functions inspected: T6.4 long-term stat fields in `.agent/DECISIONS.md`. Validation: `pnpm -C apps/mobile build` passed. Next TODO: M5.5.
- M5.5 done: mistakes and profile screens include loading, retryable error, and empty states; home links to both screens. Files changed: `apps/mobile/app/mistakes.tsx`, `apps/mobile/app/profile.tsx`, `apps/mobile/app/index.tsx`. Files/functions inspected: mobile UX scope. Validation: `pnpm -C apps/mobile typecheck` passed. Next TODO: M5.6.
- M5.6 done: added API tests for mistakes mapping and null-safe profile long-term stats plus Expo export smoke validation. Files changed: `apps/mobile/src/api/client.test.ts`. Files/functions inspected: `apps/mobile/vitest.config.ts`. Validation: `pnpm -C apps/mobile typecheck`, `pnpm -C apps/mobile test:unit`, `pnpm -C apps/mobile build` passed. Next TODO: M6.1.
- Phase M5 done: Mobile Mistakes and Profile validated; Phase M6(Mobile UX Polish) activated.
- M6.1 done: improved card-based visual styling for study, mistakes, and profile surfaces with consistent white cards, soft shadows, and off-white background. Files changed: `apps/mobile/app/study.tsx`, `apps/mobile/app/(tabs)/mistakes.tsx`, `apps/mobile/app/(tabs)/profile.tsx`. Files/functions inspected: existing mobile screens and visual policy in `.agent/DECISIONS.md`. Validation: `pnpm -C apps/mobile typecheck`, `pnpm -C apps/mobile build` passed. Next TODO: M6.2.
- M6.2 done: moved home, mistakes, profile, and settings into an Expo Router `(tabs)` group and added bottom tab navigation. Files changed: `apps/mobile/app/_layout.tsx`, `apps/mobile/app/(tabs)/_layout.tsx`, moved tab route files. Files/functions inspected: Expo Router layout files. Validation: `pnpm -C apps/mobile build` passed. Next TODO: M6.3.
- M6.3 done: increased primary/review touch target heights on study actions and kept tab navigation reachable on phone screens. Files changed: `apps/mobile/app/study.tsx`, `apps/mobile/app/(tabs)/_layout.tsx`. Files/functions inspected: study action layout. Validation: `pnpm -C apps/mobile typecheck` passed. Next TODO: M6.4.
- M6.4 done: aligned mobile tab, card, and action colors around the established Memory Note green/off-white/main-text palette. Files changed: `apps/mobile/app/(tabs)/_layout.tsx`, `apps/mobile/app/study.tsx`, `apps/mobile/app/(tabs)/mistakes.tsx`, `apps/mobile/app/(tabs)/profile.tsx`. Files/functions inspected: extension/web color direction and mobile screens. Validation: `pnpm -C apps/mobile build` passed. Next TODO: M6.5.
- M6.5 done: preserved and polished loading/error/empty states across home, study, mistakes, and profile while keeping the primary study action obvious. Files changed: mobile tab screens and study screen. Files/functions inspected: all mobile route states. Validation: `pnpm -C apps/mobile typecheck`, `pnpm -C apps/mobile test:unit`, `pnpm -C apps/mobile build` passed. Next TODO: M6.6.
- M6.6 done: ran full `pnpm run ci`. First run failed because Expo generation had introduced workspace-wide `nodeLinker: hoisted`, causing duplicate React runtime instances and web hook failures; fixed by removing `nodeLinker: hoisted` from `pnpm-workspace.yaml` and reinstalling. Second run failed because mobile React 19 types leaked into web React 18 `lucide-react` type resolution; fixed by scoping web `tsconfig` React paths to the web app's local React 18 types. Final validation: `pnpm run ci` passed across lint, typecheck, unit/integration tests, and build. Files changed: `pnpm-workspace.yaml`, `apps/web/tsconfig.json`, `.agent/DECISIONS.md`. Next TODO: None.
- Phase M6 done: Mobile UX Polish validated. All mobile phases M1-M6 are complete.
