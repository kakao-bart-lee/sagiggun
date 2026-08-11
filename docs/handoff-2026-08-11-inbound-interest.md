# Handoff — 인바운드 관심 파이프라인 + 공개 웹서비스 (2026-08-11)

브랜치 `claude/matching-service-flow-review-136b83`, 커밋 `a17f8ee` (+ 이 문서 커밋).
**푸시·PR은 하지 않았다** — 리뷰 후 푸시가 다음 단계다.

## 무엇을, 왜

수작업 매칭 흐름(① 신청 접수 → ② 번호 붙인 홍보글 → ③ "N번 맘에 들어요" DM → ④ 스펙
문의 → ⑤ 후보에게 스펙 전달·의향 확인 → ⑥ 성사)을 기존 확장·웹과 대조한 결과,
①②는 충분했지만 ③~⑥ — **인바운드 관심 처리** — 는 데이터·화면·동선이 전무했다
(기존 매칭은 운영자 주도 1→N LLM 추천뿐이고, 전달 큐도 그 추천 수락으로만 생성 가능했다).

이번 세션에서 그 갭을 메우고, 스레드 홍보를 대체하는 공개 서비스를 추가했다.
갭 분석·설계 전문: [specs/2026-08-11-inbound-interest-design.md](superpowers/specs/2026-08-11-inbound-interest-design.md)

## 구현 지도

### 도메인 (web)

| 파일 | 내용 |
|---|---|
| `prisma/schema.prisma` | `Inquiry`(target/fromHandle/fromProfile?/source/note/status) + enum 3종. `DeliveryItem`은 `suggestionId`·`toProfileId` 선택화, `inquiryId?`·`kind` 추가 |
| `prisma/migrations/20260810190831_inquiry_flow/` | 마이그레이션. 기존 전달 항목은 `MATCH_PROPOSAL`로 백필 |
| `src/lib/inquiry/state.ts` | 전이 규칙: RECEIVED → SPEC_REQUESTED → SPEC_RECEIVED → FORWARDED → ACCEPTED/DECLINED/CLOSED (CLOSED는 어디서든, RECEIVED→SPEC_RECEIVED 지름길 허용) |
| `src/lib/inquiry/templates.ts` | 문안 프리필 4종 (스펙 문의 양식 / 관심자 스펙 요약 전달문 / 성사 핸들 안내 / 거절 안내). LLM 아님 — 코드 템플릿, 운영자 수정 전제 |
| `src/lib/inquiry/service.ts` | `createInquiry`(seq/id로 대상 해석, 열린 문의 재사용, 본인 관심 차단) · `planInquiryAction`(순수 검증+전달 초안) · `applyInquiryAction`(상태 가드 updateMany 트랜잭션). match/service.ts와 같은 deps 주입 패턴 |

### API (web)

- `POST/GET /api/inquiries` — 생성(재사용 시 200+`reused:true`)·목록(`?status=`, `?handle=`, `?open=1`)
- `GET/PATCH /api/inquiries/[id]` — 상세(전달 포함)·액션(discriminated union: REQUEST_SPEC/ATTACH_PROFILE/FORWARD/ACCEPT/DECLINE/CLOSE)
- `POST /api/public/interest` — 공개 관심 접수 (targetSeq만 허용, source=WEB)
- `POST /api/public/apply` — 공개 신청 (multipart, 구조화 필드 직접 저장 + rawText 직렬화 보존, 사진 2장+, 만 19세 미만 차단)
- `src/middleware.ts` — `/api/public/` prefix는 인증 면제 (의도적 공개 네임스페이스)
- `src/lib/rate-limit.ts` — `checkPublicSubmitLimit` IP당 분당 3회 (버킷 상한 1만, 초과 시 만료 청소)

### UI (web)

- `/admin/inquiries` (+`new-inquiry-form.tsx`) — 파이프라인 목록(진행 중/접수/스펙 대기/전달됨/종결/전체) + 새 접수
- `/admin/inquiries/[id]` (+`inquiry-actions.tsx`) — 대상·관심자 패널 + 상태별 다음 액션(문안 textarea 프리필, 서버에서 계산해 내려줌) + 이 문의의 전달 목록. ATTACH 후보로 같은 핸들 프로필 5건 제안
- 프로필 상세 — 「관심 문의」 섹션 (받은 관심 + 보낸 관심)
- 전달 큐 — kind 라벨·문의 링크, `toProfileId` null 허용 렌더
- 공개: `/`(익명 목록, PUBLISHED+seq만, **핸들·사진 비노출**), `/c/[seq]`(전문+관심 폼), `/apply`(구조화 신청 폼). 루트가 기존 `redirect('/admin')`에서 공개 홈으로 바뀜 — 관리자는 `/admin` 직행
- `src/lib/ui.ts` — `INQUIRY_STATUS_LABEL`/`inquiryStatusTone`/`DELIVERY_KIND_LABEL`

### 확장 (extension)

- `api.js` — `createInquiry`/`listOpenInquiries`/`attachInquiryProfile`
- `panel.js` — ops 섹션에 「관심 접수」(게시 번호 입력 + 현재 대화 핸들), 전달 항목에 kind 라벨
- `collector.js` — 수집 성공 후 그 핸들의 열린 문의(RECEIVED/SPEC_REQUESTED만) 자동 ATTACH; 실패해도 수집은 성공 유지, `inquiriesAttached` 반환

### 테스트 · 문서

- 신규: `web/tests/inquiry-{state,service,templates}.test.ts`, 확장 collector/panel 테스트 추가
- 확장: `middleware.test.ts`(공개 prefix·유사 경로 차단), `rate-limit.test.ts`
- 갱신: `README.md`(확장 사용법 6번), `web/README.md`(관심 문의·공개 서비스 섹션), `PRODUCT.md`(capabilities 반영)

## 검증 상태

- 단위: 웹 152 / 확장 121 전부 통과, `pnpm typecheck` 클린, `pnpm build` 성공
- **실서버 스모크 완료** (built app :3199 + dev DB): 공개 관심 접수 → 재사용 → REQUEST_SPEC(큐 SPEC_REQUEST, toProfileId null) → 수집 자동 연결(SPEC_RECEIVED) → FORWARD → ACCEPT(CONNECT 2건) → 종결 후 409 / 공개 신청(multipart 사진 2장 → COLLECTED+구조화 필드) / 미성년자·사진 1장 거부 / rate limit 429 / `/`·`/c/[seq]`·`/apply` 200
- 브라우저로 공개 홈·신청 폼·관심 목록·상세 렌더 확인
- e2e(Playwright)는 **돌리지 않았다** (기존 스펙은 `/` 미의존이라 영향 없음) — inquiry 흐름 e2e는 없음

## 환경 참고 (다음 세션 주의)

- **dev DB에 마이그레이션 적용됨**: `matching_postgres`(localhost:15433)에 `inquiry_flow`가 이미 적용된 상태. 변경은 전부 가산적(새 테이블·nullable 컬럼·NOT NULL 해제)이라 main 브랜치 앱도 그대로 동작한다. 이 브랜치를 폐기하면 `_prisma_migrations`의 해당 행과 스키마 변경이 남는다는 점만 기억할 것
- 스모크 데이터는 전부 정리했다 (프로필 17·문의 0·전달 6·max seq 10 — 세션 전과 동일)
- worktree `web/.env`는 이 세션에서 만든 로컬 테스트 값(gitignored). 실제 값은 main 체크아웃의 .env 참고
- 이 환경의 LSP는 `@prisma/client` 타입을 못 읽어 가짜 진단을 낸다 — **`pnpm typecheck`가 진실**
- 배포는 컨테이너 시작 시 `prisma migrate deploy`가 자동 실행된다 (docker-compose·Cloud Run 공통)

## 다음 단계 후보

1. **푸시 + PR** — 사용자 확인 후
2. inquiry 흐름 e2e 시나리오 (`web/e2e/`, `LLM_MODE=mock` 불필요 — LLM 안 씀)
3. 설계 문서 §4의 남은 과제: 신청/관심 진행 상태 조회 토큰 · 알림(이메일/알림톡) · 핸들 소유 인증 · 공개 목록 필터/검색·페이지네이션 · 관심자용 웹 스펙 폼(현재는 자유 텍스트+운영자 문의)
4. 전달문 LLM 보강 — 현재 코드 템플릿. `lib/llm/`에 compose 패턴 재사용 여지
5. FORWARDED에서 후보 무응답 리마인드(오래된 문의 하이라이트) 같은 운영 편의
