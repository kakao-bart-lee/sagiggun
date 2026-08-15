# sagiggun 배포 기록 — 2026-08-14

## 배포 내용

- PR #15(`fix: Threads OAuth user_id 17자리 이상 정수 정밀도 손실 수정`)를
  `claude/thread-creation-api-ff930f`에 머지한 뒤, PR #14(`feat: Threads
  Publishing API 연동`, 30 커밋)를 main에 머지(`3415ba3`).
- `cd web && gcloud builds submit --config=cloudbuild.yaml --project=haruto-snow \
  --substitutions=_LLM_MODE=mock,_LLM_PROVIDER=openai,_LLM_MODEL=gpt-5.6-luna,_LLM_REASONING=high .`
  로 배포. Cloud Build `09e5ff49-524f-4894-8474-2b73c658dcd4` (SUCCESS, 3m18s) →
  `sagiggun-00007-jbl`, traffic 100%.
- `cloudbuild.yaml`의 substitutions 기본값은 `_LLM_MODE=live`이지만, OpenAI
  키가 아직 `disabled-until-configured` placeholder라 명시적으로 `mock`을
  넘겨 기존 런타임 설정(`LLM_MODE=mock`, `LLM_PROVIDER=openai`,
  `LLM_MODEL=gpt-5.6-luna`, `LLM_REASONING=high`)을 그대로 유지했다.
- 컨테이너 기동 시 `prisma migrate deploy`가 6개 마이그레이션을 전부 적용
  (`add_publish_started_at`, `add_threads_account`,
  `add_published_permalink` 포함) — 별도 수동 마이그레이션 불필요.

## Threads 운영 연동은 최초 배포에 포함되지 않았음 (이후 후속 배포로 완료)

최초 배포(`sagiggun-00007-jbl`) 시점에는 `cloudbuild.yaml`의
`--set-env-vars`/`--set-secrets`에 `THREADS_APP_ID`, `THREADS_APP_SECRET`,
`THREADS_REDIRECT_URI`가 없어 운영 `/admin/settings`의 "Threads 연결"이
503을 돌려줬다. 사용자가 Meta 대시보드에 운영용 redirect URI
(`https://love.nngn.ai/api/admin/threads/callback`, `threads_delete` 권한
포함)를 직접 등록한 뒤, 아래 후속 배포로 마무리했다.

### 후속 배포 (운영 Threads OAuth 연결)

- `sagiggun-threads-app-secret` Secret Manager 시크릿을 새로 만들고
  `sa-sagiggun-run` 서비스 계정에 `secretAccessor` 권한 부여.
- `cloudbuild.yaml`에 `_THREADS_APP_ID`/`_THREADS_REDIRECT_URI`
  substitutions와 `THREADS_APP_ID`/`THREADS_REDIRECT_URI` env var,
  `THREADS_APP_SECRET=sagiggun-threads-app-secret:latest` secret을 추가
  (commit `e7f6f8f`, main에 직접 push).
- `gcloud builds submit --config=cloudbuild.yaml --project=haruto-snow
  --substitutions=_LLM_MODE=mock,_LLM_PROVIDER=openai,_LLM_MODEL=gpt-5.6-luna,_LLM_REASONING=high .`
  로 재배포 → `sagiggun-00009-xpx`, traffic 100%. (중간에 `sagiggun-00008-ljz`는
  cloudbuild.yaml 반영 전 소스로 잘못 제출된 빌드라 env가 비어 있었음 —
  올바른 소스로 다시 제출해 00009로 대체됨.)

## 검증 결과

- Cloud Run 직접 origin `GET /admin/login`: 200
- Cloud Run 직접 origin `GET /api/profiles`(무인증): 401
- Cloudflare `https://love.nngn.ai/admin/login`: 200
- Cloudflare `https://love.nngn.ai/`(공개 홈): 200
- 신규 revision(`sagiggun-00007-jbl`) 시작 로그: 마이그레이션 6건 전부 적용,
  `✓ Ready` 확인
- `sagiggun-00009-xpx` env에 `THREADS_APP_ID`/`THREADS_REDIRECT_URI`/
  `THREADS_APP_SECRET` 정상 반영 확인 (`gcloud run revisions describe`)
- 운영 관리자 로그인 후 `GET /api/admin/threads/connect` → 307로
  `https://threads.net/oauth/authorize?...redirect_uri=https%3A%2F%2Flove.nngn.ai%2Fapi%2Fadmin%2Fthreads%2Fcallback&scope=threads_basic%2Cthreads_content_publish%2Cthreads_delete...`
  정상 리다이렉트 확인. 실제 OAuth 동의(Threads 계정 로그인)는 사용자가
  브라우저에서 직접 완료해야 한다 — 여기까지는 자동화 검증, 그 뒤는 수동.

## 후속 배포 (공개 홈 카드 출생연도·지역 노출 제거)

- PR #16(`fix: 공개 홈 카드에서 출생연도·지역 노출 제거`)을 main에 머지
  (`8f5437b`). 공개 홈 목록 카드와 조회 쿼리에서 `birthYear`, `region`
  필드를 제거해 성별·소개글만 남긴다 — 프로젝트가 비공개 스텔스 성격이라
  노출 필드를 최소화했다.
- `cd web && gcloud builds submit --config=cloudbuild.yaml --project=haruto-snow
  --substitutions=_LLM_MODE=mock,_LLM_PROVIDER=openai,_LLM_MODEL=gpt-5.6-luna,_LLM_REASONING=high .`
  로 재배포 → `sagiggun-00010-8b5`, traffic 100%.
- 검증: `https://love.nngn.ai/` 200, 응답 HTML에 `NN년생` 패턴 없음(출생연도
  뱃지 미노출 확인).
