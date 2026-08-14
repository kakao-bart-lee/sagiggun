# Threads Publishing API (서브시스템 3) 설계

작성일: 2026-08-13
상태: 설계 확정 · 같은 브랜치에서 구현
범위: 승인된 프로필을 Meta Threads Publishing API로 실제 게시하고, 그 결과를 `Profile`에 기록한다.

## 0. 배경

지금까지 게시는 전부 손으로 했다. 운영자가 Threads 웹/앱에서 직접 글을 올리고, 관리자 화면에서
"게시되어 있음으로 표시"(`POST /api/profiles/[id]/publish-mark`, `markPublished` in
`web/src/lib/profile/service.ts:76-131`)를 눌러 상태만 `PUBLISHED`로 올리고 게시 번호(`seq`)를
발급했다. `Profile.publishedPostId`는 스키마에 자리만 있고 실제로 쓰인 적이 없다
(`README.md`/`web/README.md`에 "Threads Publishing API(서브시스템 3)는 아직 없습니다"로 명시).

문제는 손으로 게시하면 Threads 자체 게시 빈도 제한에 금방 걸린다는 것. 공식 Threads API를 쓰면
프로필당 하루(rolling 24h) 250건까지는 문제가 없다. 이 설계는 그 API 연동(서브시스템 3)을 만든다.

## 1. 확정한 전제

- **텍스트만.** `finalBody`만 게시한다. 사진 첨부는 다음 단계 — Threads가 이미지를 가져갈 수 있는
  공개 URL이 필요한데, 이 앱은 "사진은 절대 공개하지 않는다"는 원칙(`/api/photos/[id]`는 항상
  인증 필요, `web/src/middleware.ts:148`)을 지키고 있어서 별도로 설계해야 한다.
- **API 게시가 유일한 경로.** 기존 수동 "게시되어 있음으로 표시" 버튼·라우트는 제거한다.
  API 실패 시를 위한 별도 수동 우회는 만들지 않는다 (§6 에러 처리 참고).
- **하루 250건 한도는 앱에서 추적하지 않는다.** Threads가 거절하면 그 에러를 그대로 화면에
  보여준다. 운영자가 하루에 수십~수백 건씩 게시할 상황이 아니라 별도 카운터가 필요 없다.
- Meta 앱 등록·OAuth 토큰 발급 절차도 이번 범위에 포함한다 (지금 아무 것도 없음).

## 2. Threads API 모양 (Meta 공식 문서 기준)

**OAuth (1회, 운영자가 관리자 화면에서 직접 수행):**

1. `GET https://threads.net/oauth/authorize?client_id=&redirect_uri=&response_type=code&scope=threads_basic,threads_content_publish&state=`
2. 콜백에 `code` 도착 → `POST https://graph.threads.net/oauth/access_token`
   (`client_id`, `client_secret`, `code`, `grant_type=authorization_code`, `redirect_uri`)
   → 단기 `access_token` + `user_id`.
3. `GET https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=&access_token=`
   → **장기 토큰**(60일, `expires_in` 초 단위로 옴).

**갱신 (만료 전에만 가능, 앱이 자동으로 함):**

`GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=` → 다시 60일 연장된 토큰.

**게시 (텍스트 전용, 2단계):**

1. `POST /{threads_user_id}/threads` (`media_type=TEXT`, `text=<finalBody>`, `access_token=`)
   → `{ id: <creation_id> }`
2. `POST /{threads_user_id}/threads_publish` (`creation_id=`, `access_token=`)
   → `{ id: <실제 게시물 id> }`

공식 권장은 두 호출 사이 30초 대기지만 텍스트는 미디어 처리가 없다. 즉시 발행을 시도하고, "아직
준비 안 됨" 계열 오류일 때만 짧게(예: 3초 간격 최대 2회) 재시도한다.

**한도:** 프로필당 250건 / rolling 24h. `threads_publish` 호출 시 초과분은 Threads가 에러로
거절한다. 확인용 엔드포인트(`GET /{id}/threads_publishing_limit`)도 있지만 §1에서 정한 대로
쓰지 않는다.

## 3. Meta 앱 등록 (수동, 운영자 본인이 해야 함)

코드로 대신할 수 없는 절차. 배포 전에 운영자가 한 번 해야 한다:

1. [Meta for Developers](https://developers.facebook.com)에서 앱 생성 → "Threads API" 제품 추가.
2. 앱 설정에 **redirect URI**를 등록 — 배포 도메인의 `/api/admin/threads/callback` (예:
   `https://<domain>/api/admin/threads/callback`). Meta는 `https` redirect URI를 요구하므로,
   **로컬(`http://localhost`)에서는 연결 플로우 자체를 실제로 테스트할 수 없다** — 배포 환경(또는
   ngrok류 터널)에서만 가능. 나머지 코드(게시 로직 등)는 유닛 테스트로 검증한다 (§7).
3. App ID / App Secret 발급 → `.env`의 `THREADS_APP_ID`, `THREADS_APP_SECRET`,
   `THREADS_REDIRECT_URI`로 등록.
4. 관리자 화면(`/admin/settings`)에서 "Threads 연결" 버튼으로 OAuth를 완료 — 이후 앱이 토큰을
   보관·갱신한다.

## 4. 데이터 모델

새 테이블, 싱글턴 row (운영자 1명 전제):

```prisma
model ThreadsAccount {
  id             String   @id @default(cuid())
  threadsUserId  String
  username       String?
  accessToken    String   @db.Text
  tokenExpiresAt DateTime
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

Postgres에 저장한다. GCP Secret Manager(`llm/config.ts`가 쓰는 방식)는 쓰지 않는다 — LLM 키는
"바뀔 때만 손으로 다시 붙여넣는" 정적 값이라 원격 회전이 의미 있었지만, Threads 토큰은 OAuth
왕복으로만 얻어지고 앱이 스스로 주기적으로 갱신해야 해서 DB row 하나가 더 단순하다. 이미
`ADMIN_PASSWORD`급 민감 정보를 평문 env로 다루는 앱이라 보안 수준도 일관된다.

`Profile.publishedPostId`(기존 컬럼, 지금까지 미사용)에 실제 게시물 id를 채운다 — 마이그레이션
불필요.

`THREADS_APP_ID` / `THREADS_APP_SECRET` / `THREADS_REDIRECT_URI`는 `ADMIN_PASSWORD`/
`OPS_API_TOKEN`과 같은 급의 평범한 `.env` 값으로 추가한다.

## 5. 라우트 구조

**연결 (관리자 설정 화면):**

- `GET /api/admin/threads/connect` — CSRF `state`를 서명 쿠키에 심고
  `threads.net/oauth/authorize`로 리다이렉트.
- `GET /api/admin/threads/callback` — `state` 검증 → code 교환 → 장기 토큰 교환 → `username`
  1회 조회 → `ThreadsAccount` upsert → `/admin/settings`로 리다이렉트. `state` 불일치면 400,
  연결 상태는 그대로 미연결로 남는다.
- `GET /api/admin/threads/status` — 연결 상태 조회. `connected`, `username`, `tokenExpiresAt`만
  반환한다 (토큰 원문은 절대 응답에 안 넣음). `llm-settings`와는 별개 라우트로 둔다 — 두 설정은
  서로 무관해서 한 응답에 섞을 이유가 없다.
- `POST /api/admin/threads/disconnect` — `ThreadsAccount` row 삭제.

**게시 (프로필 상세 화면):**

- `POST /api/profiles/[id]/publish` — 신규. 기존 `publish-mark`를 대체한다.
- 삭제: `web/src/app/api/profiles/[id]/publish-mark/**`, `web/tests/publish-mark.test.ts`.

## 6. 게시 흐름

`web/src/lib/profile/service.ts`에 `publishToThreads(id, deps)`를 추가 (기존 `markPublished`를
대체, 같은 `deps` 주입 패턴 유지):

1. `canPublish` 체크 — 기존 `state.ts`의 규칙 그대로 (APPROVED + `finalBody` 존재, 미게시).
2. `ThreadsAccount` 조회 — 없으면 `{ok:false, status:400, error:'Threads 연결이 필요합니다'}`.
3. `tokenExpiresAt`이 7일 이내로 남았으면 갱신 먼저 시도 → 성공 시 DB 갱신, 실패해도 아직
   만료 전이면 기존 토큰으로 계속 진행.
4. container 생성 → `threads_publish`. "아직 준비 안 됨" 오류면 최대 2회 짧게 재시도.
5. 성공하면 **기존 `markPublished`와 같은 낙관적 동시성 트랜잭션** (`seq` = 현재 최댓값+1,
   `where: {id, status: 'APPROVED', finalBody: <읽은 값>}`로 갱신, `count===0`이면 409) 에
   `publishedPostId`도 같이 써서 커밋.
6. **알려진 갭:** 4번(Threads 게시)은 성공했는데 5번이 409로 실패하면(그 사이 다른 요청이
   상태/본문을 바꿔서) 실제로는 Threads에 이미 올라갔지만 DB엔 반영되지 않는다. 운영자가 1명이라
   자주 발생하지 않을 것으로 보고, 이 경우 에러 메시지에 **실제 게시된 Threads post id를 그대로
   노출**해서 "게시는 됐지만 DB 반영에 실패했습니다 (post id: XXX) — 직접 확인해주세요"로 알려주는
   선에서 멈춘다. 2단계 커밋/보상 트랜잭션 같은 건 만들지 않는다.

Threads API 호출(4)은 DB 트랜잭션(5) **밖에서** 한다 — 외부 네트워크 호출을 트랜잭션 안에 넣지
않는다는 원칙.

`web/src/app/api/profiles/[id]/approve/route.ts`처럼 `approve`가 서비스 레이어 밖에 있는 기존
비일관성은 이번 작업 범위가 아니다 — 손대지 않는다.

## 7. UI

- `web/src/app/admin/profiles/[id]/editor.tsx:415-428` — "게시되어 있음으로 표시" 버튼과
  `confirm('...Threads API 없음')` 문구를 제거하고 "API로 게시" 버튼 하나로 교체. 같은 `approved`
  게이트, 같은 `call()` 헬퍼로 `/api/profiles/${id}/publish` 호출. Threads 연결이 안 돼 있으면
  버튼을 눌렀을 때 그 자리에서 에러 메시지가 뜨는 것으로 충분 — 별도 비활성화 로직은 안 만든다
  (연결 상태는 설정 화면에서 이미 보임).
- `web/src/app/admin/settings/settings-form.tsx` — "Threads 연동" 섹션 추가: 연결 상태(연결됨/
  안 됨, `@username`, 만료 예정일) + "Threads 연결" 버튼(`/api/admin/threads/connect`로 이동) +
  "연결 해제" 버튼.

## 8. 에러 처리

| 상황 | 처리 |
|---|---|
| Threads 미연결 | 400, "Threads 연결이 필요합니다" |
| 장기 토큰 만료(갱신도 실패) | 400, "Threads 연결이 만료됐습니다. 다시 연결해주세요" |
| `canPublish` 실패 (미승인/이미 게시 등) | 기존과 동일하게 400 |
| container/publish 호출 실패 (250건 초과 포함) | Threads의 `error_message`를 그대로 담아 400/502 |
| container 성공, DB 갱신만 409 | §6-6의 post id 포함 에러 메시지 |
| OAuth `state` 불일치 | 콜백에서 400, 미연결 상태 유지 |

## 9. 테스트

기존 테스트들이 서비스 함수를 `deps` 주입으로 목 처리하는 패턴(`markPublished`의 `deps` 참고)을
그대로 따른다. 실제 `graph.threads.net`/`threads.net` 호출은 어떤 테스트에서도 하지 않는다.

- `web/tests/publish.test.ts` (신규, `publish-mark.test.ts` 대체): `canPublish` 가드, 낙관적
  동시성 409, 주입한 Threads 클라이언트의 성공/오류/재시도 분기.
- `web/tests/threads-client.test.ts` (신규): container→publish 2단계 호출 조합, 재시도 로직,
  "만료 7일 이내면 갱신" 판단을 `fetch` 목으로 검증.
- OAuth connect/callback 라우트: `state` 검증, 토큰 교환 성공/실패 분기를 유닛 테스트로.
- **e2e(Playwright)는 이번 범위에 포함하지 않는다.** Threads 연결은 로컬/CI에서 실제로 수행할
  수 없고(§3), 유닛 테스트가 게시 로직과 에러 분기를 충분히 덮는다.

## 10. 파일 변경 요약

**신규:**
- `web/src/lib/threads/client.ts` — OAuth 교환/갱신, container/publish 호출, `fetch` 래퍼(재시도).
- `web/src/lib/threads/account.ts` — `ThreadsAccount` 조회/저장/삭제.
- `web/src/app/api/admin/threads/connect/route.ts`
- `web/src/app/api/admin/threads/callback/route.ts`
- `web/src/app/api/admin/threads/disconnect/route.ts`
- `web/src/app/api/admin/threads/status/route.ts`
- `web/src/app/api/profiles/[id]/publish/route.ts`
- `web/tests/publish.test.ts`
- `web/tests/threads-client.test.ts`
- Prisma migration: `ThreadsAccount` 테이블 추가.

**수정:**
- `web/src/lib/profile/service.ts` — `markPublished` → `publishToThreads`.
- `web/src/lib/env.ts` — `THREADS_APP_ID`/`THREADS_APP_SECRET`/`THREADS_REDIRECT_URI` 추가.
- `web/.env.example` — 위 3개 키 문서화.
- `web/src/app/admin/profiles/[id]/editor.tsx` — 버튼 교체.
- `web/src/app/admin/settings/settings-form.tsx` — Threads 연동 섹션 추가.
- `README.md`/`web/README.md` — "서브시스템 3는 아직 없습니다" 문구 갱신, Meta 앱 등록 절차 안내.

**삭제:**
- `web/src/app/api/profiles/[id]/publish-mark/route.ts`
- `web/tests/publish-mark.test.ts`
