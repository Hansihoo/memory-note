# Delivery 002: Chrome Extension Mini Quiz

## 이번 회차 목표
- Chrome 페이지 우측 상단에 시간이 되면 작은 노트형 암기 퀴즈를 바로 띄운다.
- 사용자는 노트 형식 화면에서 위쪽 문제와 아래쪽 답 영역을 보며 `O` 또는 `X`를 누른 뒤 답을 확인한다.
- 문제와 답 옆의 작은 스피커 버튼으로 현재 단어를 들을 수 있다. 답 스피커는 답이 표시된 뒤에만 보인다.
- `O` 또는 `X`를 누르면 선택한 버튼이 있던 위치가 그대로 `다음` 버튼으로 바뀐다.
- 기본 라운드는 1시간마다 5단어로 설정하고, 완료 후 패널은 자동으로 사라진다.
- 이후 모바일 앱과 확장 프로그램이 같은 퀴즈 로직을 재사용할 수 있도록 공통 코어를 둔다.

## 구현 범위
- `packages/core`
  - `MemoryCard` 타입
  - 미니 퀴즈 세션 생성/진행/완료 로직
  - 기본 예시 단어
- `apps/extension`
  - Manifest V3 Chrome Extension
  - 모든 `http/https` 페이지에 content script 주입
  - Shadow DOM 기반 우측 상단 노트형 퀴즈 UI
  - 팝업의 `암기 시작` 화면도 노트 배경으로 표시
  - `chrome.storage.local`에서 저장 단어를 읽고, 없으면 기본 예시 단어 사용
  - 웹 모델의 `key/value` 데이터와 확장 모델의 `prompt/answer` 데이터를 모두 허용
  - 확장 옵션 화면에서 `몇 시간마다`, `몇 개씩`을 선택해 저장
  - 마지막 표시 시간을 기준으로 설정한 시간이 지나면 노트형 퀴즈를 바로 표시
  - 확장 로드/새로고침 시 이미 열려 있던 일반 웹 탭에도 content script를 주입
  - 열린 탭에 이전 content script UI가 남아 있으면 새 노트형 UI로 교체
  - 옵션 화면에서 `지금 바로 테스트`로 표시 기록 초기화
  - 확장 아이콘 팝업에서 `암기 시작`을 누르면 현재 탭에 즉시 퀴즈 강제 시작
  - 페이지 주입이 막히는 환경에서도 `암기 시작`을 누르면 확장 팝업 안에서 바로 퀴즈 진행

## 로컬 확인 방법
1. `pnpm install`
2. `pnpm run extension:build`
3. Chrome에서 `chrome://extensions` 열기
4. 개발자 모드 켜기
5. `apps/extension/dist` 폴더를 `압축해제된 확장 프로그램을 로드`로 선택
6. 일반 `http/https` 웹페이지를 연다
7. Chrome 툴바의 `Memory Note Mini Quiz` 아이콘을 누른다
8. 팝업에서 `암기 시작`을 눌러 팝업 안에서 퀴즈를 푼다
9. 확장 프로그램 `세부정보`의 `확장 프로그램 옵션`에서 표시 간격과 단어 수 변경
10. 자동 표시가 바로 보이지 않으면 옵션의 `지금 바로 테스트` 또는 툴바 팝업의 `암기 시작` 사용

## 검증 명령
- `pnpm run core:test:unit`
- `pnpm run extension:test:unit`
- `pnpm run extension:typecheck`
- `pnpm run extension:build`
- `pnpm run extension:verify`

## 개발 확인 흐름
- Chrome에 이미 설치한 확장 프로그램은 번들 파일이 바뀌어도 자동으로 새로고침되지 않으므로 `chrome://extensions`에서 다시 로드해야 한다.
- 수동 확인을 줄이기 위해 `pnpm run extension:verify`를 사용한다. 이 명령은 확장을 빌드한 뒤 임시 Chromium에 `apps/extension/dist`를 새로 로드하고 팝업 퀴즈, 시간 경과 콘텐츠 퀴즈, 제거된 문구, O/X 버튼 크기, 스피커 버튼, `다음` 버튼 위치를 자동 점검한다.
- 사람이 직접 화면을 볼 때만 Chrome 확장 관리 화면에서 다시 로드하고, 일반 수정 검증은 `pnpm run extension:verify`를 우선 사용한다.

## 다음 단계
- 웹앱의 실제 로그인/동기화 단어장을 확장 프로그램 저장소로 가져오는 흐름
- 사용자가 방해받지 않도록 사이트별 일시정지/끄기 설정
- 모바일 앱용 `apps/mobile` 추가와 같은 `packages/core` 재사용
