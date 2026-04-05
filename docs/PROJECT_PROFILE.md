# PROJECT_PROFILE

## 부트스트랩 요약
- 프로젝트 유형: 사주를 제공하는 웹 서비스 템플릿
- 저장소 구조: 단일 repo
- 프런트엔드 후보: React + Vite
- 백엔드 후보: FastAPI
- 데이터베이스 후보: PostgreSQL
- 프런트 배포 후보: Vercel
- CI 기본 후보: GitHub Actions
- 코드 스타일 강도: 중간
- 문서 언어: 한국어
- 자동화 목표: 가능한 범위까지 최대 자동화
- subagent 역할 후보: planner / implementer / verifier / documenter
- 작업 방식: 기획과 개발을 여러 회차로 나눠 사용자와 계속 대화하며 진행

## 현재 확정된 항목
- 실제 제품 코드는 만들지 않는다.
- 템플릿 문서와 workflow 중심으로 저장소를 구성한다.
- 단일 repo 안에 문서, workflow, infra 자리까지 포함한다.
- 사람들의 일반적인 관습에 맞는 구조와 규칙을 우선 채택한다.
- 기획은 단계별로 쪼개고, 개발은 작은 반복 루프로 진행한다.

## 미확정 시 작업 규칙
- 현재 작업에 필요한 값이 미확정이면 먼저 질문한다.
- 구현, 배포, 자동 수정은 관련 항목이 확정된 뒤에만 진행한다.
- 결정이 늦어질 수 있는 값은 `{{PLACEHOLDER}}`와 `TODO(USER):`로 남긴다.

## 회차 운영 기본안
- 기획 회차: 문제 정의 -> 사용 사례 -> 화면 구조 -> UX/UI -> 정책/범위 -> 개발 전달
- 개발 회차: 범위 합의 -> 구현 -> build/test -> 로그 확인 -> 수정 -> 짧은 문서화
- 각 회차 결과에는 `이번 회차 결정`, `남은 질문`, `다음 회차 시작점`이 포함된다.

## 미확정 항목
- 프로젝트명: `{{PROJECT_NAME}}`
- 패키지 매니저: `{{FRONTEND_PACKAGE_MANAGER}}`
- Python 패키지/실행 도구: `{{PYTHON_TOOLCHAIN}}`
- 프런트 테스트 도구: `{{FRONTEND_TEST_STACK}}`
- 백엔드 테스트 도구: `{{BACKEND_TEST_STACK}}`
- 린트/포맷 도구: `{{LINT_AND_FORMAT_STACK}}`
- 타입 검사 방식: `{{TYPECHECK_STRATEGY}}`
- 로컬 실행 방식: `{{LOCAL_RUNTIME_STRATEGY}}`
- 로그 수집 방식: `{{LOGGING_STRATEGY}}`
- 백엔드 배포 대상: `{{BACKEND_HOSTING}}`
- Preview 환경 운영 여부: `{{PREVIEW_ENV_POLICY}}`
- Staging 환경 사용 여부: `{{STAGING_POLICY}}`
- 배포 승인 정책: `{{DEPLOY_APPROVAL_POLICY}}`
- 문서 상세 수준: `{{DOC_DETAIL_LEVEL}}`
- Git branch 전략 세부: `{{BRANCH_STRATEGY}}`
- commit 규칙 세부: `{{COMMIT_CONVENTION}}`
- merge 방식: `{{MERGE_STRATEGY}}`
- 자동 수정 허용 범위: `{{AUTO_FIX_BOUNDARY}}`
- 기획 회차 기록 위치: `{{PLANNING_LOG_LOCATION}}`
- 개발 회차 기록 위치: `{{DELIVERY_LOG_LOCATION}}`

## 권장 기본안
- 프런트 패키지 매니저: `pnpm`
- Python 도구: `uv`
- 프런트 테스트: `Vitest` + `Playwright`
- 백엔드 테스트: `pytest`
- 린트/포맷: `ESLint` + `Prettier` + `ruff`
- 타입 검사: 프런트 `tsc`, 백엔드 `mypy`
- 로컬 실행: 루트 표준 명령 + 앱별 명령 병행
- 로그 확인: 앱 로그 + 컨테이너 로그를 루트 명령으로 통합
- 백엔드 배포: `Render` 또는 `Railway`
- 환경: `local / preview / prod`
- 배포 토폴로지: 프런트 `Vercel`, 백엔드 `Render` 또는 `Railway`, DB는 managed `PostgreSQL`
- branch 전략: `main + feature branch`
- commit 규칙: `Conventional Commits`
- merge 방식: `squash merge`
- 기획 회차 기록: issue 또는 `docs/planning/*.md`
- 개발 회차 기록: PR 본문, changelog 성격 문서, 또는 `docs/delivery/*.md`

## TODO(USER)
- 실제 프로젝트명을 확정한다.
- 백엔드 호스팅 우선순위를 정한다.
- 문서 상세 수준과 팀 문서 운영 기준을 정한다.
- 자동 수정이 허용되는 범위를 정한다.
- Preview/Staging 정책을 확정한다.
