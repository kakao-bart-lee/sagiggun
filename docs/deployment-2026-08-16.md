# sagiggun 배포 기록 — 2026-08-16

## 배포 내용

상호 매칭 기능(`design/reciprocal-matching`, 16 커밋)을 main에 머지하고 배포했다.
설계는 `docs/superpowers/specs/2026-08-15-reciprocal-matching-design.md`에 있다.

- 성별 하드필터 추가, 이미 판정한 짝 재추천 방지, 나이 게이트 ±2년 여유
- 상대적 나이 표현(「위로 2살」)을 출생연도 구간으로 저장 — 채움률 23% → 84%
- `faceType`·`partnerFaceTypes`·`partnerHeightMin/Max`·`smoking`·`tattoo`·`drinking`
  컬럼 추가 (전부 nullable, 추가만)
- 지역을 하드필터에서 점수로 내리고 광역 코드로 비교 — 오탐 80% → 51%
- LLM에 두 방향 점수를 요구하고 핸들 대신 게시번호로만 지칭
- 짝 대조 시트 신설 (`/admin/match`)

### 머지

- `design/reciprocal-matching`을 main에 `--no-ff` 머지(`3eb2949`).
- 머지 직전 원격 main이 3커밋 앞서 있는 것을 발견 — PR #16(`fix: 공개 홈 카드에서
  출생연도·지역 노출 제거`)과 그 배포 기록. 겹치는 파일이 없어 충돌 없이 합쳤다
  (`87396d6`). 합친 상태에서 테스트 345건 통과, `tsc` 0, `next build` exit 0을
  다시 확인한 뒤 push했다 (`6ed1913..87396d6`).

### GitHub 인증이 막혔던 원인

`gh auth status`가 `The token in GITHUB_TOKEN is invalid`를 냈고 `git push`도
`Invalid username or token`으로 실패했다. **환경변수 `GITHUB_TOKEN`에 만료된
classic 토큰(`ghp_…`)이 들어 있어 keyring의 정상 토큰을 가리고 있었다** — `gh`는
환경변수를 keyring보다 우선한다. 재로그인 불필요했고, 해당 변수만 비우면 통과한다.

```
GITHUB_TOKEN= GH_TOKEN= git push origin main
```

keyring에는 `kakao-bart-lee`(github.com, `repo` 스코프)가 정상 등록돼 있다. 같은
`gh`에 사내 GHE(`github.daumkakao.com`)도 있고 그쪽이 active로 잡혀 있으나 이
저장소와 무관하다. `origin`은 공개 github.com이다.

### 배포

```
cd web && gcloud builds submit --config=cloudbuild.yaml --project=haruto-snow \
  --substitutions=_LLM_MODE=mock,_LLM_PROVIDER=openai,_LLM_MODEL=gpt-5.6-luna,_LLM_REASONING=high .
```

- Cloud Build `be5f3a0b-837d-4240-9987-36b034879cea` (SUCCESS, 4m15s) →
  `sagiggun-00011-nkb`, traffic 100%.
- substitutions는 2026-08-14 배포와 동일하게 넘겼다. `cloudbuild.yaml` 기본값은
  `_LLM_MODE=live`지만 OpenAI 키가 아직 placeholder라 기존 런타임 설정
  (`LLM_MODE=mock`)을 그대로 보존해야 한다. 배포 전 `gcloud run services describe`로
  현재 env를 읽어 확인했다.
- 컨테이너 기동 시 `prisma migrate deploy`가 신규 마이그레이션
  `20260815164555_add_face_height_lifestyle`을 적용(총 7건) — 수동 작업 불필요.
  전부 nullable 컬럼 추가라 기존 행에 영향 없다.

## 운영 DB가 사실상 비어 있었다 (배포 후 발견)

배포 자체는 정상이었으나 **운영 Profile이 3건뿐이고 후보 풀(APPROVED/PUBLISHED)이
0건**이었다. 매칭 화면을 열어도 후보가 하나도 안 나오는 상태였다. 개발 중 검증에
쓴 게시 프로필 69건은 저장소 루트 `some_us_love_profiles.json`을 **로컬 DB에** 넣은
것이고 운영에 올라간 적이 없었다.

### `import-published.ts`를 비파괴 모드로 고쳤다

기존 스크립트는 `--fresh`만 있었고 그것이 `profile.deleteMany({})`를 호출했다.
운영에는 신청서로 들어온 3건이 이미 있어 그대로 쓸 수 없었다.

- `--fresh`를 없애고 `--apply`로 대체. **삭제 경로가 코드에 없다.**
- 키는 `seq`다 — 스키마에서 unique인 것은 그것뿐이고(`sourceHandle`은 인덱스만
  있다), 게시번호는 사람과 1:1이라 여러 번 돌려도 결과가 같다.
- 판단 로직은 `web/src/lib/profile/import-plan.ts`의 `planImport`로 분리하고
  테스트를 붙였다(`tests/import-plan.test.ts`, 7건). 우리가 넣지 않은 번호를
  만나면 덮지 않고 충돌로 보고만 하며, 들여올 목록에 없는 기존 행은 계획에
  언급조차 되지 않는다.
- 로컬(이미 69건 있음)에서 「새로 0 · 갱신 69 · 충돌 0」으로 멱등성을 확인한 뒤
  운영에 미리보기 → `--apply` 순으로 실행했다.

```
기존 3건 → 새로 69 · 갱신 0 · 충돌 0     총 72건
```

운영의 기존 3건은 전부 `seq = null`이라 1~69번과 충돌하지 않았고 그대로 남아 있다.

### 공개 노출은 일어나지 않는다

들여온 69건은 `status = PUBLISHED`지만 공개 페이지에 뜨지 않는다. 공개 홈과
`/c/[seq]`가 `finalBody: { not: null }`까지 요구하는데, 들여온 행은 원문(`rawText`)만
있고 작문 완료본이 없기 때문이다. 사진도 없으므로 이 조건이 없었다면 사진 빠진
카드가 노출될 뻔했다. 매칭 후보 풀에는 상태만 보므로 정상적으로 들어간다.

특정 번호를 실제로 공개하려면 운영자 화면에서 작문·발행하면 된다.

### 나이·키 백필은 실익이 없어 실행하지 않았다

`backfill-ideal.ts --dry`를 운영에 돌린 결과 3건 중 고칠 것이 1건(`키 175 이상`
파싱)뿐이었다. 69건은 import 시점에 이미 파싱해서 넣으므로 백필 대상이 아니다.

## 검증 결과

- Cloud Run 직접 origin `GET /admin/login`: 200
- Cloud Run 직접 origin `GET /api/profiles`(무인증): 401
- Cloud Run 직접 origin `GET /admin/match`(무인증): 307 (로그인 리다이렉트)
- Cloudflare `https://love.nngn.ai/admin/login`: 200
- Cloudflare `https://love.nngn.ai/`(공개 홈): 200, 카드 0개
- `https://love.nngn.ai/c/1`, `/c/55`: 404 (`finalBody` 없음 — 의도대로)
- 신규 revision 기동 로그: `Applying migration 20260815164555_add_face_height_lifestyle`
  → `All migrations have been successfully applied.` → `✓ Ready in 524ms`
- 운영 데이터로 매칭 계산: 후보 풀 69명, 후보 수 **중앙값 27 · 최소 4 · 0명인 사람
  없음**. 1번의 1순위 짝은 55번(조화평균 0.859)으로 로컬 검증치와 일치.
- 운영 기존 3건(`jxxng_xnn`, `1`, `babyorangeeagles`) 보존 확인.

## 롤백

들여온 69건만 지우면 된다. 기존 3건은 `seq = null`이라 무관하다.

```sql
DELETE FROM "Profile" WHERE "sourceHandle" LIKE 'someuslove-%';
```

배포 자체를 되돌리려면 이전 리비전(`sagiggun-00010-*` 또는 `00009-xpx`)으로
traffic을 옮긴다. 다만 마이그레이션은 추가만 했으므로 되돌릴 필요가 없다.

## 운영 DB 접속 방법 (다음에 필요할 때)

운영 DB는 Secret Manager + Cloud SQL 소켓이라 로컬에서 바로 못 붙는다.

```
cloud-sql-proxy haruto-snow:asia-northeast3:moonlit-prod --port 15499 &
# DATABASE_URL 시크릿(sagiggun-database-url)에서 소켓 host를 127.0.0.1:15499로 바꿔 쓴다
```

작업 후 프록시를 내리고 임시 자격증명 파일을 지운다.

## 남은 것

- **얼굴상·흡연·문신·음주를 신청 폼이 안 받는다.** 컬럼은 생겼지만 `/apply`에
  입력란이 없어 신규 신청자는 계속 비어 들어온다. 자유텍스트 데알브레이커
  부분문자열 매칭(오탈락만 하는 §2-3)도 이 필드가 생겨야 걷어낼 수 있다.
- **`PostMetric`/`MatchFeedback` 축적 레이어**(스펙 §7)는 미구현. 거절 사유가
  쌓여야 가중치를 실측으로 정할 수 있다(스펙 §4.4의 열린 질문).
- **DM 발송 방식** 미결 — 순차 대 동시, 한쪽 방향 제안 여부.
- 후보 풀에 `seq`가 없는 APPROVED 프로필이 섞이면 「번호 미발급」으로 떠서 번호로
  소개할 수 없다. 지금 운영에는 해당 없음(APPROVED 0건).
