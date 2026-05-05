# Memory Note Development Status

Last updated: 2026-05-05

Branch: `codex/complete-current-active-phase-tasks`

## Current State

- Completed through: Phase 15
- Active phase: None
- Latest verification: `pnpm run ci` passed
- API test count at latest run: 37 passed
- Latest commits:
  - `c9e2a27 Complete paid content and analytics phases`
  - `eef77e6 Complete memory note phase 6 through 13`

## Product Direction

Memory Note has been expanded from a simple wordbook/review app into a card-based learning platform foundation.

The current implementation supports:

- card-based review state
- server-authoritative study queues
- long-term memory handling
- sentence, cloze, and typing cards
- course content structures
- offline-capable shared session/pending review models
- group and classroom learning structures
- non-payment paid-content entitlement structure
- learning analytics and recommendation signals

## Completed Features

### 1. Card-Based Review Engine

Purpose:
Move learning from legacy word-only progress into a more flexible card model.

Implemented:

- `memory_items`
- `cards`
- `review_states`
- `review_logs`
- `SchedulerService` with `SimpleSRS`
- card review API
- legacy word API compatibility

Checkpoints:

- `review_logs` are treated as immutable history.
- Legacy words are preserved.
- A single memory item can generate multiple card types.

### 2. Migration Cleanup and Shared Types

Purpose:
Keep old word data compatible while preparing web, extension, and API to share the same review language.

Implemented:

- backfill from legacy words into memory items/cards/review states
- idempotent backfill behavior
- shared enums in `packages/core`
- matching API schema enums
- shared rating/platform mappings
- external `StudyPlatform.API` rejection while preserving existing DB rows

Checkpoints:

- Existing user data is not deleted during migration/backfill.
- Shared enum values are used consistently across clients.

### 3. Today Queue, Summary, and Mistakes API

Purpose:
Provide one server-side study queue for web, extension, and future clients.

Implemented:

- `GET /study/today` returns `{ summary, cards }`
- global queue when `wordbookId` is omitted
- wordbook-specific queue when `wordbookId` is provided
- deleted memory items and inactive cards are excluded
- due, overdue, weak, and new card prioritization
- same-memory-item spreading to reduce consecutive related cards
- `GET /study/mistakes`
- queue and mistakes API tests

Checkpoints:

- Queue output is server-generated, not test-only.
- Weak cards include lapses, leech score, and recent AGAIN reviews.

### 4. Web Study UX v2, Mistake Note, and Profile Stats

Purpose:
Update the web app to use the new server study APIs.

Implemented:

- web study screen uses `/study/today`
- reviews are submitted through `POST /study/cards/{cardId}/review`
- shared rating maps from `packages/core`
- mistake note section using `/study/mistakes`
- profile stats based on `review_states` and `review_logs` while preserving legacy behavior
- web tests

Checkpoints:

- Existing profile response fields remain compatible.
- Review-state and legacy-learning-event stats are merged with deduplication.

### 5. Chrome Extension Server Sync

Purpose:
Make the browser extension use the same server queue and review submission path.

Implemented:

- extension loads cards from `/study/today?limit=5`
- no automatic quiz when token is missing
- login/connect guidance when token is missing
- O/X reviews mapped to GOOD/AGAIN
- pending review queue with `clientEventId`
- retry/drop behavior by response status
- extension tests

Checkpoints:

- Network/5xx failures are retried.
- 401/403 stops flush and preserves pending items.
- 404/409/422 are dropped as non-retryable.

### 6. Long-Term Memory and MASTERED

Purpose:
Separate long-term retained cards from normal review while still sampling them periodically.

Implemented:

- conservative MASTERED transition
- old MASTERED card sampling in `/study/today`
- MASTERED card moves to RELEARNING on AGAIN
- long-term memory stats in `/profile/summary`
- tests

Long-term stats added:

- `masteredCount`
- `longTermReviewCount30d`
- `longTermCorrectCount30d`
- `longTermRecallRate30d`
- `masteredLapseCount30d`
- `oldMasteredDueCount`

Checkpoints:

- MASTERED transition requires conservative review history.
- MASTERED AGAIN does not erase `mastered_at`.
- Long-term stats are optional fields and backward-compatible.

### 7. FSRS Scheduler

Purpose:
Add a more advanced scheduler option without breaking the existing scheduler contract.

Implemented:

- `FSRSScheduler` beside `SimpleSRS`
- `SCHEDULER_ENGINE` config
- stable `SchedulerService.review(state, rating, reviewed_at)` interface
- computed retrievability
- scheduler tests

Checkpoints:

- Default scheduler remains `simple`.
- Invalid scheduler config falls back to `simple`.
- Retrievability is computed, not stored as a DB column.

### 8. Word to Sentence Cards

Purpose:
Support richer learning from examples, not only isolated word pairs.

Implemented:

- `exampleSentence` storage
- CLOZE card generation from examples
- TYPING card support
- web renderers for CLOZE and TYPING
- `responseText` stored for typing reviews
- tests

Checkpoints:

- Removing example sentences deactivates managed sentence cards.
- Review logs remain preserved.
- Typing answers can be stored for later review.

### 9. Markdown v2 and Course Pack

Purpose:
Expand import/export metadata and add content-only course structures.

Implemented:

- Markdown v2 columns:
  - `itemType`
  - `exampleSentence`
  - `sentence`
  - `tags`
  - `cloze`
- Markdown v1 compatibility
- `course_packs`
- `course_units`
- `course_lessons`
- `course_lesson_items`
- course content separated from user review state
- tests

Checkpoints:

- Course content is source content only.
- Course content does not have `user_id` or review-state ownership.
- User learning state is created separately later through course start.

### 10. Core Session Engine and Offline Sync

Purpose:
Share study-session and pending-review logic across web and extension.

Implemented:

- `packages/core/src/session.ts`
- shared `TodayCard`
- shared `TodaySummary`
- shared `ReviewRequest`
- shared `ReviewResponse`
- shared `PendingReviewEvent`
- web session utility reuse
- extension pending queue reuse
- tests

Checkpoints:

- Client session behavior is centralized.
- Extension pending reviews use the shared event model.

### 11. Study Events and Retention UX

Purpose:
Create an append-only UX event layer for learning milestones and retention signals.

Implemented:

- `study_events` table/model
- event generation after review-state updates
- events for:
  - `MASTERED`
  - `MASTERED_LAPSE`
  - `LEECH`
  - `ZOMBIE_REVIEW`
- `funEventsEnabled` setting
- `/me/settings` read/update endpoints
- tests

Checkpoints:

- `study_events` are UX events, not the source of truth.
- Turning off fun events prevents new study events.
- Existing review logs are not mutated.

### 12. Study Groups

Purpose:
Allow learners to join private study groups and aggregate progress safely.

Implemented:

- `study_groups`
- `study_group_members`
- group wordbook linking
- group progress summary
- group weak cards
- permission tests

Privacy policy:

- Groups are private.
- Creator becomes active OWNER.
- Invited users start as PENDING.
- Progress includes only active members' explicitly linked wordbooks.
- Weak-card details return only the requester-owned linked cards.

Checkpoints:

- Outsiders cannot read group data.
- Pending members are not included in progress.
- Other users' card prompts/answers are not exposed by default.

### 13. Teacher Classes and Assignments

Purpose:
Add teacher/student classroom workflows and assignment tracking.

Implemented:

- `classes`
- `class_members`
- teacher/student roles
- assignments
- assignment progress
- teacher dashboard APIs
- permission tests

Privacy policy:

- Classes are private.
- Creator becomes active TEACHER.
- Students start as PENDING.
- Dashboard returns aggregate assignment progress, not per-student review details.
- Assignments can reference only the teacher's own wordbooks.

Checkpoints:

- Students cannot use teacher-only actions.
- Outsiders cannot access class data.
- Student review state is not copied or deleted.

### 14. Paid Course Content and Entitlements

Purpose:
Add paid-course access structure without integrating real payments.

Implemented:

- `products`
- `user_entitlements`
- `course_enrollments`
- course access checks
- course start flow
- internal product/grant/revoke service functions
- tests

Entitlement rules:

- `user_entitlements` is the source of truth.
- Free course packs are accessible without entitlement.
- Paid course packs require ACTIVE entitlement.
- REVOKED or EXPIRED entitlement does not grant access.
- PURCHASE is schema-ready only; real payment integration is deferred.

Admin policy:

- No unsafe public admin routes were exposed.
- Since no secure admin role system exists, admin basics are internal service functions plus tests.

Checkpoints:

- Starting a course creates user-owned learning state.
- Source course content is not mutated.
- Revoking entitlement does not delete `review_logs` or `review_states`.

### 15. Analytics and Recommendation Improvements

Purpose:
Add visibility into learning quality and expose conservative recommendation signals.

Implemented:

- authenticated `/analytics/summary`
- review analytics:
  - review count
  - correct count
  - AGAIN count
  - recall rate
- card quality analytics:
  - active cards
  - weak cards
  - leech cards
  - low-recall cards
  - average retrievability
- content quality analytics:
  - active items
  - missing example sentences
  - tagged items
  - sentence-ready items
- optional today-card fields:
  - `recommendationReason`
  - `recommendationScore`
- tests

Checkpoints:

- Analytics are read-only.
- No learning data is mutated.
- Empty data returns zero-safe values.
- Today queue response shape remains backward-compatible through optional fields.

## Verification Summary

Latest full validation:

```powershell
pnpm run ci
```

Result:

- lint passed
- typecheck passed
- unit tests passed
- integration/API tests passed
- build passed

API tests at latest run:

```text
37 passed
```

## Main Files Touched

API:

- `apps/api/app/main.py`
- `apps/api/app/models.py`
- `apps/api/app/review.py`
- `apps/api/app/schemas.py`
- `apps/api/app/migrations.py`
- `apps/api/tests/test_api.py`
- `apps/api/tests/test_scheduler_policy.py`

Web:

- `apps/web/src/App.tsx`
- `apps/web/src/api/client.ts`
- `apps/web/src/types.ts`
- `apps/web/src/utils/session.ts`
- `apps/web/src/utils/markdown.ts`
- `apps/web/src/styles.css`

Extension:

- `apps/extension/src/api.ts`
- `apps/extension/src/pending-review.ts`
- `apps/extension/src/popup.ts`

Core:

- `packages/core/src/session.ts`
- `packages/core/src/index.ts`

Project tracking:

- `.agent/MEMORY_NOTE_TASKS.md`
- `.agent/DECISIONS.md`

## Review Notes

Areas worth checking manually:

1. `apps/api/app/main.py` has grown large and is now a refactoring candidate.
2. Recommendation scores are conservative heuristics and should be tuned with real user data.
3. Phase 14 does not include real payment provider integration.
4. Group/class progress intentionally uses aggregate and privacy-safe defaults.
5. Course source content and user learning state are intentionally separate.
6. Admin course management is internal-only until a secure admin role system exists.

## Current Completion Status

All listed phases are complete:

- Phase 1: Completed
- Phase 2: Completed
- Phase 3: Completed and audited
- Phase 4: Completed
- Phase 5: Completed
- Phase 6: Completed
- Phase 7: Completed
- Phase 8: Completed
- Phase 9: Completed
- Phase 10: Completed
- Phase 11: Completed
- Phase 12: Completed
- Phase 13: Completed
- Phase 14: Completed
- Phase 15: Completed

