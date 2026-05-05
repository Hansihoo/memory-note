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
- Completed through: Phase 2
- Active phase: Phase 4
- Next task: T4.4 Mistake note 화면 요구사항 확정 필요

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
Status: Active

TODO:
- [x] T6.1 Apply conservative MASTERED transition.
- [x] T6.2 Include old MASTERED cards in today queue sampling.
- [x] T6.3 Move MASTERED card to RELEARNING on AGAIN.
- [ ] T6.4 Add long-term memory stats.
- [ ] T6.5 Add tests.

## Phase 7 — FSRS Scheduler
Status: Pending

TODO:
- [ ] T7.1 Add FSRS scheduler implementation beside SimpleSRS.
- [ ] T7.2 Add scheduler engine config.
- [ ] T7.3 Keep SchedulerService interface stable.
- [ ] T7.4 Treat retrievability as computed value.
- [ ] T7.5 Add scheduler tests.

## Phase 8 — Word to Sentence Cards
Status: Pending

TODO:
- [ ] T8.1 Add example sentence storage.
- [ ] T8.2 Generate CLOZE cards from examples.
- [ ] T8.3 Add TYPING card support.
- [ ] T8.4 Add web renderers for CLOZE and TYPING.
- [ ] T8.5 Store responseText for typing reviews.
- [ ] T8.6 Add tests.

## Phase 9 — Markdown v2 / Course Pack
Status: Pending

TODO:
- [ ] T9.1 Extend Markdown import for sentence/cloze/tag metadata.
- [ ] T9.2 Keep Markdown v1 compatible.
- [ ] T9.3 Add course_pack/unit/lesson structure.
- [ ] T9.4 Keep course content separate from user review state.
- [ ] T9.5 Add tests.

## Phase 10 — Core Session Engine / Offline Sync
Status: Pending

TODO:
- [ ] T10.1 Add shared session engine to packages/core.
- [ ] T10.2 Add TodayCard, TodaySummary, ReviewRequest, ReviewResponse types.
- [ ] T10.3 Add PendingReviewEvent model.
- [ ] T10.4 Reuse core session logic in web/extension where practical.
- [ ] T10.5 Add tests.

## Phase 11 — Fun Events / Retention UX
Status: Pending

TODO:
- [ ] T11.1 Add study_events table/model.
- [ ] T11.2 Generate events after review_state update.
- [ ] T11.3 Add leech/zombie event logic.
- [ ] T11.4 Add user setting to disable fun elements.
- [ ] T11.5 Add tests.

## Phase 12 — Study Groups
Status: Pending

TODO:
- [ ] T12.1 Add study_groups.
- [ ] T12.2 Add study_group_members.
- [ ] T12.3 Add group wordbook linking.
- [ ] T12.4 Add group progress summary.
- [ ] T12.5 Add group weak cards.
- [ ] T12.6 Add permission tests.

## Phase 13 — Teacher Classes / Assignments
Status: Pending

TODO:
- [ ] T13.1 Add classes and class_members.
- [ ] T13.2 Add teacher/student roles.
- [ ] T13.3 Add assignments.
- [ ] T13.4 Add assignment progress.
- [ ] T13.5 Add teacher dashboard APIs.
- [ ] T13.6 Add permission tests.

## Phase 14 — Paid Course Content / Entitlements
Status: Pending

TODO:
- [ ] T14.1 Add products and entitlements.
- [ ] T14.2 Add course access checks.
- [ ] T14.3 Add course start flow.
- [ ] T14.4 Add admin course management basics.
- [ ] T14.5 Add tests.

## Phase 15 — Analytics / Recommendation Improvements
Status: Pending

TODO:
- [ ] T15.1 Add review analytics.
- [ ] T15.2 Add card quality analytics.
- [ ] T15.3 Improve today queue recommendations.
- [ ] T15.4 Add content quality signals.
- [ ] T15.5 Add tests.

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
