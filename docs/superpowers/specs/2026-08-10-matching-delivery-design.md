# 매칭·전달 (서브시스템 4) 설계

작성일: 2026-08-10
상태: 설계 확정
범위: DM 수집(확장) · 1→N 매칭 추천(웹 LLM) · 전달 DM 초안 · 확장 삽입(보내기는 수동)

## 1. 경계

| 포함 | 제외 |
|---|---|
| 확장 「이 대화 수집」→ 기존 `POST /api/profiles` (+ photos) | Threads Publishing API (SS3) |
| 웹 하드필터 + Claude 매칭 순위·양방향 전달초안 | Send 버튼 자동 클릭 |
| 확장 전달 큐에서 문구 삽입 → 운영자가 보냄 | 확장에서 Anthropic 호출 |
| Bearer `OPS_API_TOKEN`으로 확장이 API 호출 | 다중 운영자·권한 |

Threads에 DM API가 없으므로 수집·전달은 브라우저 확장만 가능하다. LLM·상태·큐는 웹이 소유한다.

## 2. 인증

- 관리 UI: 기존 세션 쿠키
- 확장 / API 클라이언트: `Authorization: Bearer <OPS_API_TOKEN>`
- `OPS_API_TOKEN` 미설정 시 Bearer는 통과하지 않음 (fail-closed)
- Bearer는 `/api/*`만 허용. `/admin/*` HTML은 세션 필수

## 3. 수집 (확장 → 웹)

1. Threads DM 대화에서 「이 대화 수집」
2. 핸들·본문 DOM best-effort 추출 (DOM 변경 시 실패 가능)
3. `POST /api/profiles` → 가능하면 CDN 이미지를 받아 `POST .../photos`
4. 성공 시 관리자 프로필 URL 안내. **자동 extract/compose는 하지 않음** (비용·검수)
5. 사진 실패 시 텍스트만 저장하고 관리자에서 보완

입수 API는 SS1과 동일 — 클라이언트만 추가한다.

## 4. 매칭

- 모드: **한 subject 프로필**에 대해 후보 N명(기본 5) 추천
- 후보 풀: `PUBLISHED` ∪ `APPROVED`, subject·ARCHIVED 제외
- 하드필터 (`web/src/lib/match/filter.ts`): 자기 자신 제외, 출생연도 상호 구간, 지역 힌트, 성별이 있으면 대칭 선호가 명확할 때만 통과
- LLM (`web/src/lib/llm/match.ts`): 통과 후보(상한 30)를 받아 순위·score·rationale·`draftForSubject`·`draftForCandidate` 구조화 출력. 없는 사실 추측 금지

데이터:

- `MatchRun` — subject 기준 1회 실행
- `MatchSuggestion` — 후보·초안·상태(`PENDING` | `ACCEPTED` | `DISMISSED`)
- `ACCEPTED` 시 `DeliveryItem` 2건(subject·candidate 각각)

## 5. 전달

- `DeliveryItem`: `toHandle`, `body`, `PENDING` | `INSERTED` | `DONE` | `CANCELLED`
- 확장: 대기 큐 표시 → 「삽입」(Lexical inserter 재사용) → `INSERTED` → 운영자 Send 후 「완료」→ `DONE`
- Send DOM 클릭 없음

## 6. Known failure

- Threads DOM/에디터/대화 헤더 변경 → 수집·삽입 실패. 원문 클립보드 백업·수동 붙여넣기
- DM CDN 사진 URL 만료 → 서버 fetch 실패. 관리자 업로드로 보완
