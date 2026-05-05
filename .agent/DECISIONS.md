# Agent Decisions

- (template) Record backward-compatible default decisions here with date, context, and rationale.
- 2026-05-04: T4.5 profile 통계 호환 정책 적용. legacy learning_events 필드는 유지하고, review_logs/review_states 데이터가 있으면 우선 사용하되 중복은 memory_item_id > word_id > card_id 순서로 제거한다. API 응답 shape은 유지하고 확장 필드는 optional로 추가한다.
- 2026-05-04: T5.5 pending review queue 정책 반영. chrome.storage.local `pendingReviewQueue` 사용, 7일 보관/최대 200건 유지, flush 시 oldest-first 최대 20건 전송, 401/403은 큐 보존 후 중단, 404/409/422는 드롭, 네트워크/5xx는 재시도 카운트 증가.
- 2026-05-04: T6.1 MASTERED 정책 확정. REVIEW 상태에서만 interval_days>=30, streak>=5, lapses<=1, (difficulty 존재 시 <=0.7)일 때만 MASTERED 전환. difficulty가 null이면 차단하지 않음. MASTERED에서 AGAIN 시 RELEARNING/10분 due/lapses+1/streak=0/leech+2/last_reviewed_at 갱신, mastered_at은 유지.
- 2026-05-04: T6.2 장기 MASTERED 샘플링 정책 적용. /study/today에서 MASTERED 카드 장기 점검 슬롯을 limit의 10%(최소 1, 최대 limit)로 포함하고, 최근 7일 복습한 MASTERED는 제외, due된 MASTERED는 일반 due 카드로 처리. 정렬 우선순위는 last_reviewed_at(오래된 순) -> mastered_at -> card created/updated, 중복 카드 제외 및 memory_item 연속 최소화를 유지.
