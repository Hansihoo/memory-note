# COMMANDS

## 목적
이 문서는 Codex에 바로 입력할 수 있는 canonical prompt와, 이후 저장소 루트 명령 이름의 기준을 정리한다.

## 권장 루트 명령 이름
- `dev`
- `build`
- `test`
- `lint`
- `format`
- `typecheck`
- `logs`
- `ci`
- `db:up`
- `db:down`
- `db:migrate`
- `preview`
- `release:check`

## Codex에 그대로 말할 수 있는 canonical prompt 예시
- `template-bootstrap skill로 이 저장소를 {{PROJECT_NAME}} 프로젝트 기준으로 부트스트랩해`
- `product-planning skill로 이번 회차는 기획 1단계만 진행해`
- `feature-delivery skill로 이번 회차 범위만 구현하고 검증, 로그 확인까지 진행해`
- `maintenance-bugfix skill로 재현부터 회귀 확인까지 처리해`
- `release-cicd skill로 릴리즈 체크리스트를 수행해`
- `docs-sync skill로 현재 저장소 상태에 맞게 문서를 동기화해`

## 사용 순서 가드레일
- 현재 작업에 필요한 값이 `{{PLACEHOLDER}}`면 `template-bootstrap`부터 사용한다.
- 요구사항이 아직 모호하면 `feature-delivery`보다 `product-planning`을 먼저 사용한다.
- 증상 재현과 원인 분석이 필요하면 `feature-delivery`보다 `maintenance-bugfix`를 먼저 사용한다.
- 배포 대상과 승인 정책이 미정이면 `release-cicd` 전에 `PROJECT_PROFILE`과 `CI_CD`를 먼저 채운다.
- 이미 확정된 내용을 문서에 반영하는 작업만 남았을 때 `docs-sync`를 사용한다.

## 명시적 skill 호출 예시
- `template-bootstrap skill을 사용해서 PROJECT_PROFILE의 placeholder를 채우기 위한 인터뷰부터 진행해`
- `product-planning skill을 사용해서 이번 회차는 사용자 시나리오만 정리해`
- `product-planning skill을 사용해서 화면 구조와 UX 우선순위만 이번 회차에서 정리해`
- `feature-delivery skill을 사용해서 승인된 요구사항 중 가장 작은 단위만 구현하고 build/test/logs까지 확인해`
- `maintenance-bugfix skill을 사용해서 버그를 재현하고 원인 분석 후 회귀 테스트까지 진행해`
- `release-cicd skill을 사용해서 CI 상태, 배포 설정, 롤백 계획을 점검해`
- `docs-sync skill을 사용해서 AGENTS와 docs 문서를 현재 규칙에 맞게 정리해`

## 새 프로젝트 시작 시 순서
1. `template-bootstrap skill로 이 저장소를 프로젝트별로 부트스트랩해`
2. `product-planning skill로 기획 1단계인 문제 정의만 진행해`
3. `product-planning skill로 다음 회차에서 사용자 흐름과 화면 구조를 이어서 진행해`
4. `docs-sync skill로 문서 구조를 현재 프로젝트명 기준으로 정리해`
5. `feature-delivery skill로 첫 구현 회차 범위만 정하고 검증 명령까지 구성해`

## 기획 시작 명령 예시
- `product-planning skill로 {{FEATURE_NAME}}의 문제 정의만 이번 회차에서 정리해`
- `product-planning skill로 이전 기획을 이어서 사용자 흐름과 실패 케이스를 정리해`
- `product-planning skill로 화면 구성, UX/UI 우선순위, 사용자 스토리만 정리해`

## 개발 시작 명령 예시
- `feature-delivery skill로 {{FEATURE_NAME}}의 첫 개발 회차를 진행해. 범위를 작게 잡고 build/test/logs까지 확인해`
- `feature-delivery skill로 이전 회차 다음 단계만 진행해. 문제가 있으면 수정 후 간단히 문서화해`

## 유지보수 시작 명령 예시
- `maintenance-bugfix skill로 {{ISSUE_NAME}}를 재현하고 수정 후 회귀 확인까지 진행해`

## 릴리즈 시작 명령 예시
- `release-cicd skill로 이번 배포의 체크리스트와 위험 요소를 점검해`

## TODO(USER)
- 실제 프로젝트에서 루트 명령을 어떤 도구로 연결할지 확정
- 프런트/백엔드별 세부 명령 네이밍 확정
- 자동 로그 수집과 preview 명령 지원 범위 확정

## 이어서 진행할 때 쓰는 짧은 명령
- `이전 기획 회차 이어서 진행해`
- `이전 개발 회차 다음 단계만 진행해`
- `이번 회차에서 남은 TODO만 처리해`
- `문서와 현재 상태를 동기화해`
