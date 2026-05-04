# Delivery 003: Card Based Scientific Memory System

## 목표
- 기존 `word` 중심 학습 흐름을 `memory_item -> card -> review_state -> review_log` 구조로 전환한다.
- 기존 `words`, `learning_events`, 기존 학습 API는 1차에서 삭제하지 않고 호환 adapter로 유지한다.
- 웹과 Chrome 확장이 같은 서버 today queue와 card review API를 사용하도록 만든다.

## 구현 범위
- API
  - `memory_items`, `cards`, `review_states`, `review_logs` 모델 추가
  - 기존 `words.memory_item_id` 추가 및 기존 단어 backfill migration 추가
  - 신규 backfill 생성 대상은 삭제되지 않은 `words`와 삭제되지 않은 `wordbooks`로 제한
  - 삭제된 word는 이미 연결된 `memory_item/card`가 있을 때만 inactive/deleted 상태로 반영
  - backfill idempotency 기준은 `legacy_word_id`, `(item_id, card_type)`, `card_id`
  - `create_default_cards_for_item()`로 item type별 기본 카드 생성 정책 분리
  - `SchedulerService` 인터페이스와 `SimpleSRS` 구현
  - `GET /study/today`, `POST /study/cards/{cardId}/review`, `GET /study/mistakes` 추가
  - 기존 `POST /study/words/{word_id}`는 deprecated adapter로 유지
  - `clientEventId` 기반 review log 중복 제출 방지
  - 삭제된 word는 memory item soft delete, card inactive 처리, review log 보존
  - `learning_events -> review_logs` 변환은 1차/2차에서 수행하지 않고 후속 optional migration으로 분리
  - 외부 review 요청의 `StudyPlatform`은 `WEB/EXTENSION/MOBILE`만 허용하고, 기존 DB의 `API` 문자열 값은 보존

- Web
  - 기존 학습 화면 레이아웃을 유지하면서 `/study/today` 응답의 `summary/cards` 구조 처리
  - `cardId`가 있는 학습 카드는 새 card review API로 제출
  - 기본 버튼을 `모름 / 힘들게 맞춤 / 바로 앎`으로 구성하고 `AGAIN / HARD / GOOD`으로 매핑
  - 웹 로그인 토큰을 Chrome extension storage 동기화용 window message로 전달

- Chrome Extension
  - 로컬 기본 카드 대신 서버 `/study/today.cards`를 사용
  - O/X를 `GOOD/AGAIN`으로 제출
  - review 제출 시 `clientEventId` 포함
  - 토큰이 없으면 자동 퀴즈를 표시하지 않고 팝업에서 연결 안내 표시
  - smoke test 서버도 서버 today/review API 흐름 기준으로 갱신

## 검증 명령
- `pnpm run api:test`
- `pnpm run web:test:unit`
- `pnpm run extension:test:unit`
- `pnpm run extension:verify`
- `pnpm run ci`

## 1차 제외
- `SENTENCE` 자동 카드 생성
- MASTERED 장기기억 샘플링 큐
- FSRS 최적화
- 모바일 앱 구현

## 2차 고정 사항
- `packages/core/src/types.ts`와 FastAPI enum 값이 어긋나지 않도록 계약 테스트를 둔다.
- 기존 `WORD` 데이터 backfill은 양방향 카드를 유지한다.
