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

## Threads 운영 연동은 이번 배포에 포함되지 않음

`cloudbuild.yaml`의 `--set-env-vars`/`--set-secrets`에 `THREADS_APP_ID`,
`THREADS_APP_SECRET`, `THREADS_REDIRECT_URI`가 아직 없다. 즉 이번 배포로
코드는 올라갔지만 운영 `/admin/settings`의 "Threads 연결"은
`env.threadsAppId` 등이 비어 있어 503("Threads 앱 설정이 없습니다")을
그대로 돌려준다. 사용자와 논의해 이번 배포 범위에서 의도적으로 제외했다.

다음에 Threads 운영 연동을 진행할 때 필요한 것:

1. Meta 개발자 대시보드에서 운영용 redirect URI
   `https://love.nngn.ai/api/admin/threads/callback`을 등록(사용자가 직접
   해야 함 — Meta 계정 작업).
2. `THREADS_APP_SECRET`을 Secret Manager에 새 시크릿으로 추가(예:
   `sagiggun-threads-app-secret`).
3. `cloudbuild.yaml`의 `--set-env-vars`에 `THREADS_APP_ID=...,
   THREADS_REDIRECT_URI=https://love.nngn.ai/api/admin/threads/callback`을,
   `--set-secrets`에 `THREADS_APP_SECRET=sagiggun-threads-app-secret:latest`를
   추가.
4. 재배포 후 관리자 로그인 → `/admin/settings`에서 "Threads 연결"로 OAuth
   완료.

## 검증 결과

- Cloud Run 직접 origin `GET /admin/login`: 200
- Cloud Run 직접 origin `GET /api/profiles`(무인증): 401
- Cloudflare `https://love.nngn.ai/admin/login`: 200
- Cloudflare `https://love.nngn.ai/`(공개 홈): 200
- 신규 revision(`sagiggun-00007-jbl`) 시작 로그: 마이그레이션 6건 전부 적용,
  `✓ Ready` 확인
