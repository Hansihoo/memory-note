# Delivery 001: Memory Assistant MVP

## 이번 회차 목표
- 1단계부터 출시 전 정리까지 MVP 기능을 한 번에 구현한다.

## 구현 범위
- 웹 앱 기본틀
- 단어장/단어 CRUD
- Markdown import/export
- FastAPI 백엔드
- SQLite 기본 DB와 `DATABASE_URL` 기반 DB 설정
- 운영용 PostgreSQL `DATABASE_URL` 연결 기준
- 로그인/사용자별 단어장 분리
- Google 로그인 우선 인증과 개발용 password 로그인 fallback
- 멀티앱 동기화를 위한 서버 revision 기반 Sync API
- 로그인 후 홈 화면 전환
- 숨길 수 있는 왼쪽 암기장 목록
- 상단 메뉴 기반 `암기` / `단어장 편집` / `프로필` 화면 분리
- 암기 세션
- 프로필 누적 학습일
- 테스트/디버그 로그 구조
- CI 명령

## 주요 결과물
- `apps/web`: React + Vite 웹 앱
- `apps/api`: FastAPI 백엔드
- `package.json`: 루트 실행 명령
- `.github/workflows/ci.yml`: PR/push 검증
- `.env.example`: 로컬 환경값 예시

## 현재 UI 흐름
- 제품 기본 로그인은 Google 로그인이며, 아이디 방식은 `가입`과 `로그인` 탭으로 명확히 분리한다.
- 아이디 방식으로 가입/로그인하면 서버가 bearer token을 발급하고, 웹은 토큰을 자동 저장해 이후 API 호출에 자동으로 붙인다.
- 새 계정에는 기본 샘플로 `해외 여행 필수 영단어` 100개와 `해외여행 필수 영어문장` 100개가 자동 생성된다.
- 로그인 후 웹은 서버 `sync/pull` 기반으로 단어장 데이터를 받아오며, 모바일 앱/Chrome 확장/Windows 앱도 같은 Sync API를 사용할 수 있다.
- 단어장/단어 변경은 서버 revision과 sync event로 기록하고, 오래된 클라이언트 변경은 서버 우선 정책으로 충돌 처리한다.
- 홈 화면 왼쪽에는 암기장 목록과 단어장 생성이 있고, 목록은 숨길 수 있다.
- `암기` 화면은 사용자가 제공한 나무 책상 이미지를 배경으로 사용하고, 흰색 줄노트는 HTML/CSS UI로 만들어 문제/답을 표시한다.
- 문제 방향은 단어마다 랜덤으로 섞어 출제한다.
- 암기 시작 버튼 없이 선택된 단어장의 첫 문제가 바로 열린다.
- 노트 위쪽에는 문제만 보여주고, 아래쪽 답은 처음에는 숨긴다.
- `알고 있음`을 누르면 답을 보여주고, 버튼이 `다음`으로 바뀐 뒤 사용자가 눌러 다음 문제로 이동한다.
- `모르겠음`을 누르면 답을 보여주고 버튼이 `다음`으로 바뀐다.
- `단어장 편집` 화면은 엑셀형 시트 UI로 단어 추가와 삭제를 같은 표에서 다룬다.
- 단어장 편집 화면도 사용자가 제공한 나무 책상 이미지 배경 위에서 열린다.
- 새 단어 입력 기본 행은 한 줄만 보여주고, `줄 추가`로 확장한다.
- 시트 아래쪽에는 실제로 추가하지 않은 빈 격자 행을 이어서 보여준다.
- 단어 편집 화면은 전체 페이지를 늘리지 않고, 엑셀형 시트 영역 안에서 스크롤해 편집한다.
- 시트 선택 표시는 질문/답변 열에만 적용하고, 최근 학습/관리 열은 선택하지 않는다.
- 단어장 편집 화면에는 `편집`, `파일 내보내기`, `파일 가져오기` 작업 버튼이 있고, 내보내기 모드에서는 엑셀형 시트를 숨긴 뒤 같은 작업영역을 Markdown 화면으로 대체한다.
- `파일 내보내기`는 현재 선택한 단어장을 편집 가능한 Markdown 텍스트로 보여주고 `.md` 다운로드를 제공한다.
- `파일 가져오기`는 팝업창에서 로컬 `.md/.txt` 파일 또는 Google Drive 파일 선택을 제공하며, 가져온 Markdown은 기존 단어장을 덮지 않고 새 암기장으로 생성한다.
- Google Drive 가져오기는 `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_APP_ID` 설정이 있을 때 활성화된다.
- `프로필` 화면에서 누적 학습일과 오늘 학습한 단어 수를 확인한다.

## 검증 명령
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm run test:e2e`
- `pnpm run ci`
- `pnpm run release:check`

## 로그 기준
- production 기본 로그는 `warn` 이상이다.
- 상세 로그는 `LOG_LEVEL=debug` 또는 기능별 플래그로만 켠다.
- 주요 플래그:
  - `DEBUG_IMPORT`
  - `DEBUG_SESSION`
- `DEBUG_PROGRESS`
- `DEBUG_AUTH`
- 단어 내용, 답변 내용, 비밀번호, 토큰은 로그에 남기지 않는다.
- Google Drive 파일 읽기는 `drive.readonly` 범위만 사용한다.

## 남은 위험
- 서버 bearer token은 유지하지만 제품 로그인은 Google ID token 검증을 통해 발급한다.
- 로컬 기본 DB는 SQLite이며, 운영 배포 시 PostgreSQL `DATABASE_URL`과 `GOOGLE_CLIENT_ID`를 연결해야 한다.
- 현재 호환 migration은 앱 시작 시 기본 컬럼을 보강하는 수준이며, 운영 배포 전에는 Alembic 등 정식 migration 도구 도입이 필요하다.
- 모바일 앱/Windows 앱/Chrome 확장은 아직 구현하지 않았다.
- AI 추천과 음성 인식은 후속 기능이다.
