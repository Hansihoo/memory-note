# CI_CD

## 현재 기본 방향
- CI 기본 도구는 `GitHub Actions`
- 프런트 배포 후보는 `Vercel`
- 백엔드 배포 후보는 `{{BACKEND_HOSTING}}`
- 자동화 목표는 높은 수준이지만, 검증 가능한 범위부터 단계적으로 확장한다.

## 권장 기본 전략
- Pull Request:
  - lint, test, typecheck, build를 우선 수행
  - 가능하면 preview 배포를 생성
  - PR 본문에 변경 범위, 검증 결과, 남은 위험을 남긴다
- main merge:
  - 재실행 가능한 CI 검증
  - 필요 시 preview 또는 staging 승격
- production:
  - 태그 또는 명시적 승인 기반 배포 권장

## 권장 파이프라인 단계
1. 설치 및 캐시 복원
2. 정적 검사
3. 테스트
4. 빌드
5. 아티팩트 또는 preview 배포
6. 배포 후 기본 헬스체크

## 프런트엔드 권장안
- 호스팅: Vercel
- Preview: PR 단위 preview 권장
- Production: main 또는 release tag 기반 정책 중 하나 선택

## 백엔드 권장안
- 호스팅 후보: Render 또는 Railway
- 배포 단위: FastAPI 앱 + PostgreSQL 연결
- 검증: 헬스체크 엔드포인트, 기본 smoke test, 로그 확인

## 롤백 기본 원칙
- 프런트: 이전 배포 승격 또는 이전 배포 재활성화
- 백엔드: 이전 이미지/릴리즈 재배포
- DB: 자동 롤백을 전제로 하지 말고 마이그레이션 되돌림 전략을 별도 정의

## 모니터링과 확인 항목
- 배포 직후 헬스체크
- 주요 API 응답 상태
- 인증/핵심 사용자 흐름
- 애플리케이션 로그
- DB 연결 오류 여부

## 대화형 릴리즈 원칙
- 릴리즈도 한 번에 밀어붙이지 말고, 배포 전 점검과 배포 후 확인을 분리한다.
- 자동화가 있더라도 결과 해석과 승인 포인트는 사용자와 다시 확인한다.

## TODO(USER)
- `{{BACKEND_HOSTING}}` 확정
- Preview 환경 운영 범위 확정
- staging 필요 여부 확정
- production 승인 방식 확정
- 시크릿 관리 방식 확정
