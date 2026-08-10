# 인바운드 관심 흐름 · 공개 웹서비스 설계

작성일: 2026-08-11
상태: 설계 확정 · 같은 브랜치에서 구현
범위: 수작업 매칭 흐름 대비 갭 분석(§1–2) · 관심(Inquiry) 파이프라인(§3) · 공개 웹서비스(§4)

## 0. 수작업 흐름 (운영 실태)

홍보 계정 운영자는 지금까지 이렇게 일했다.

1. **신청 접수** — 양식 DM (사진 2장+, 나이/성별/키, 직업/취미, 어필 3가지, 이상형: 키·얼굴상·내적·나이차·지역·절대 안 되는 것)
2. **홍보 글 게시** — 번호를 붙인 익명 소개글 (`67. ✨ 수원에 사시는 00년생…`)
3. **관심 DM 수신** — "67번 맘에 들어요"
4. **스펙 문의** — 관심자에게 저장해 둔 멘트로 스펙(본인 소개)을 요청
5. **스펙 전달** — 답장을 받으면 관심받은 후보에게 그 스펙을 전달하고 만날 의향을 묻는다
6. **성사/거절** — 양쪽 OK면 서로 핸들을 알려주고 연결

## 1. 현재 기능 대조 (질문 1)

| 수작업 단계 | 현재 지원 | 판정 |
|---|---|---|
| 1. 신청 접수 | 확장 「이 대화 수집」(핸들·본문·사진 스크레이프) 또는 관리자 수동 붙여넣기 → `Profile(COLLECTED)` → LLM 추출 | **충분** |
| 2. 홍보 글 게시 | LLM 작문 → 승인 → 수동 게시 + 「게시됨으로 표시」 시 `seq`(게시 번호) 자동 발급. 게시 자체는 SS3 미구현이라 수동 | **충분** (게시 자동화만 미래 과제) |
| 3. 관심 DM 수신 | **없음.** 관심을 기록할 데이터·화면·동선이 전무 | **갭 (핵심)** |
| 4. 스펙 문의 | 확장 '문구'로 멘트 삽입은 가능하나, 어떤 후보에 대한 문의인지·보냈는지·답장이 왔는지 시스템이 모름 | **갭** |
| 5. 스펙 전달 | `DeliveryItem`(전달 큐)이 있으나 **LLM 매칭 추천(MatchSuggestion) 수락으로만 생성 가능.** 인바운드 관심 건으로는 큐에 넣을 방법이 없음. 수신자가 프로필 미등록(핸들만 아는 관심자)이면 `toProfileId` 필수 제약 때문에 아예 못 만듦 | **갭** |
| 6. 성사/거절 | 없음. 의향 응답·성사 기록 없음 | **갭** |

요약: 현재 시스템은 **운영자가 능동적으로 매칭을 제안하는 모델(1→N LLM 추천)** 만 구현돼 있고,
실제 운영의 중심인 **게시글을 보고 들어오는 관심(인바운드)을 접수→문의→전달→성사로 굴리는 파이프라인**이 없다.
확장의 문구·수집·전달 큐는 좋은 부품이지만 이 부품들을 관심 건 단위로 묶어주는 상태 머신이 빠져 있다.

세부 갭:

- (A) 관심 접수 기록 — 누가(핸들) 몇 번(seq)에 관심 있는지
- (B) 스펙 문의 발송·답장 대기 추적 — 리마인드 대상 파악 불가
- (C) 수집된 프로필 ↔ 관심 건 연결 — 스펙 답장을 수집해도 "67번에 대한 관심자"라는 정보가 안 남음
- (D) 임의 전달 항목 생성 불가 — 전달 큐가 MatchSuggestion 전용, `toProfileId` 필수
- (E) 후보 의향 응답(수락/거절)·성사 기록 없음
- (F) 전달 큐 항목의 종류 구분 없음 — 스펙 문의인지 스펙 전달인지 성사 안내인지 확장에서 알 수 없음

## 2. 설계 원칙 (기존과 동일)

- Threads에 DM API가 없으므로 **보내기는 언제나 사람이 누른다.** 시스템은 초안 큐잉과 상태 추적까지만.
- 원본 보존 — 관심 DM 원문·신청 원문은 그대로 저장한다.
- LLM/템플릿 초안은 운영자 수정을 전제로 한 프리필이다.

## 3. 관심(Inquiry) 파이프라인 — 백오피스 확장

### 데이터

```
enum InquiryStatus { RECEIVED → SPEC_REQUESTED → SPEC_RECEIVED → FORWARDED → ACCEPTED | DECLINED | CLOSED }
enum DeliveryKind  { MATCH_PROPOSAL, SPEC_REQUEST, SPEC_FORWARD, CONNECT, OTHER }

Inquiry: target(관심 대상 Profile) · fromHandle · fromProfile?(스펙 수집 후 연결) ·
         source(THREADS|WEB) · note(원문 DM 등) · status · deliveries[]
```

`DeliveryItem` 변경: `suggestionId`·`toProfileId`를 선택으로 완화, `inquiryId?`·`kind` 추가.
기존 매칭 수락 경로는 `kind=MATCH_PROPOSAL`로 계속 동작한다.

### 상태 전이 (lib/inquiry/state.ts)

| 상태 | 의미 | 다음 |
|---|---|---|
| RECEIVED | 관심 접수 | SPEC_REQUESTED · SPEC_RECEIVED(스펙이 이미 있으면) · CLOSED |
| SPEC_REQUESTED | 관심자에게 스펙 문의 큐잉/발송 | SPEC_RECEIVED · CLOSED |
| SPEC_RECEIVED | 스펙 수신, 관심자 프로필 연결됨 (연결 필수) | FORWARDED · CLOSED |
| FORWARDED | 후보에게 스펙 전달·의향 문의 | ACCEPTED · DECLINED · CLOSED |
| ACCEPTED / DECLINED / CLOSED | 성사 / 후보 거절 / 종료 | (종결) |

### API

- `POST /api/inquiries` — `{targetSeq|targetId, fromHandle, note?, source?}`. 같은 (대상, 핸들) 열린 문의가 있으면 재사용(중복 방지).
- `GET /api/inquiries?status=&handle=` — 목록 (확장·관리자)
- `PATCH /api/inquiries/[id]` — 액션 기반 전이:
  - `REQUEST_SPEC {body}` → SPEC_REQUEST 전달 생성 + SPEC_REQUESTED
  - `ATTACH_PROFILE {fromProfileId}` → 프로필 연결 + SPEC_RECEIVED
  - `FORWARD {body}` → 후보에게 SPEC_FORWARD 전달 생성 + FORWARDED
  - `ACCEPT {bodyForFrom?, bodyForTarget?}` → (선택) CONNECT 전달 2건 + ACCEPTED
  - `DECLINE {body?}` → (선택) 관심자 안내 전달 + DECLINED
  - `CLOSE` → CLOSED

문안 프리필은 `lib/inquiry/templates.ts` (스펙 문의 멘트 · 관심자 프로필 요약 전달문 · 성사/거절 안내).

### 관리자 UI

- `/admin/inquiries` — 파이프라인 목록(상태 필터) + 새 관심 등록(번호·핸들)
- `/admin/inquiries/[id]` — 진행 화면: 대상·관심자·다음 액션 버튼 + 문안 편집 textarea
- 프로필 상세에 「이 프로필에 온 관심」 섹션, 톱바에 「관심 문의」 링크

### 확장

- 「관심 접수」 버튼 — 현재 대화 핸들 + 번호 입력 → `POST /api/inquiries`
- 「이 대화 수집」 확장 — 수집 후 이 핸들의 열린 관심 문의가 있으면 자동으로 `ATTACH_PROFILE` (스펙 답장 수집 = 문의에 연결)
- 전달 큐 항목에 종류 라벨(스펙 문의/스펙 전달/성사 안내/매칭 제안) 표시

## 4. 공개 웹서비스 (질문 2)

지금의 웹서비스를 backoffice로 두고, 스레드 홍보를 대체/보완하는 신청자·열람자용 공개 서비스.

### 이번에 구현하는 것 (MVP)

| 화면 | 내용 |
|---|---|
| `/` | 서비스 소개 + 이용 안내(자격·사진 비공개 원칙) + 후보 목록. `PUBLISHED`(=게시 승인 + seq 발급)만 노출. 번호·소개글(finalBody)·성별/지역/출생연대 뱃지. **사진·핸들은 절대 비공개** |
| `/c/[seq]` | 후보 상세: 소개글 전문 + 「관심 보내기」 폼(내 스레드 핸들 or 연락처 + 하고 싶은 말) → `Inquiry(source=WEB)` 생성 → 이후 백오피스 파이프라인 합류 |
| `/apply` | 신청 폼 — 기존 DM 양식의 구조화: 본인/친구 대리, 성별·출생연도·키·지역·직업, 취미, 어필 3가지, 이상형(키·느낌·내적·나이차·지역·절대 안 되는 것), 스레드 핸들(연락 수단), 사진 2장+, 성인·개인정보 동의 필수 → `Profile(COLLECTED)` + 사진 저장. rawText에는 양식 텍스트를 직렬화해 원본 보존 |

공개 API: `POST /api/public/apply` (multipart) · `POST /api/public/interest`.
미들웨어 PUBLIC_PATHS에 추가하고 IP 슬라이딩 윈도우 rate limit을 건다.
`/`는 기존 `redirect('/admin')`을 공개 홈으로 교체 (관리자는 `/admin` 직행).

### 이후 과제 (이번 범위 밖)

- 신청/관심 **진행 상태 조회** — 접수 시 발급하는 조회 토큰으로 내 건 상태 확인
- **알림** — 이메일/카카오 알림톡 등. 지금은 스레드 DM(수동)이 통지 채널
- **신청자 인증** — 핸들 소유 증명(예: 확인 코드 DM). 지금은 운영자가 DM으로 검증
- 후보 목록 **검색/필터**(성별·지역·연령대), 페이지네이션
- 관심자가 웹에서 직접 스펙 폼을 채우는 동선(`/apply`와 통합) — MVP에서는 자유 텍스트 + 운영자 문의로 처리
- 다중 운영자·권한, 신고/차단, 약관·개인정보처리방침 정식 문서

## 5. 구현 순서

1. Prisma 스키마 + 마이그레이션 (Inquiry, DeliveryItem 완화, enum 2종)
2. `lib/inquiry/{state,templates,service}.ts` + 단위 테스트
3. API 라우트 (inquiries CRUD/전이, public apply/interest) + 미들웨어 공개 경로 + rate limit
4. 관리자 UI (`/admin/inquiries`, 상세, 프로필 연동, 전달 큐 kind 라벨)
5. 공개 페이지 (`/`, `/c/[seq]`, `/apply`)
6. 확장 (관심 접수 · 수집 시 자동 연결 · 큐 라벨) + 테스트
7. 전체 테스트·빌드 검증
